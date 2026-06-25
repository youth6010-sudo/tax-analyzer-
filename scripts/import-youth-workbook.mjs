/**
 * 청년들 ID.xlsx import (비품 주문 제외)
 * node scripts/import-youth-workbook.mjs [--fees-only|--operational-only|--link-only] [xlsx경로]
 *
 * --fees-only         0618id 수임료만 반영 (TP 매칭 실패 → client_fee_import_pending)
 * --operational-only  유입·프로세스·유출만 upsert (수임처관리 시트 건너뜀)
 * --link-only         수임처 INSERT·roster 덮어쓰기 금지 (legacy)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { detectYouthIdWorkbook, mergeChecklists, parseWorkbook } from './lib/youth-workbook-parse.mjs';
import {
  isManagerNameOnlyRow,
  normBizNo,
  normalizeCompanyKey,
  reportSkippedRows,
} from './lib/client-import-guards.mjs';
import {
  inquiryMatchesProcess,
  upsertInquiryFromProcess,
} from './lib/intake-link.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

loadEnv();

const args = process.argv.slice(2);
const feesOnly = args.includes('--fees-only');
const operationalOnly = args.includes('--operational-only');
const linkOnly = args.includes('--link-only') && !feesOnly && !operationalOnly;
const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
const xlsxPath =
  args.find(a => !a.startsWith('--')) ||
  path.join(desktop, '청년들 ID.xlsx');

if (!fs.existsSync(xlsxPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const getSheetRows = name =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
if (!detectYouthIdWorkbook(wb.SheetNames, getSheetRows)) {
  console.error('청년들 ID.xlsx 형식이 아닙니다. (수임처관리·청년들ID 또는 수임처관리 블록 레이아웃 필요)');
  process.exit(1);
}

const data = parseWorkbook(wb, XLSX);
const sourceBasename = path.basename(xlsxPath);
console.log('파싱:', {
  clients: data.clients.length,
  inquiries: data.inquiries.length,
  processes: data.processes.length,
  churns: data.churns.length,
});
if (feesOnly) console.log('모드: --fees-only (0618id 수임료만)');
else if (operationalOnly) console.log('모드: --operational-only (유입·유출만)');
else if (linkOnly) console.log('모드: --link-only (수임처 INSERT·roster 덮어쓰기 금지)');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function ensureFeePendingTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS client_fee_import_pending (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      manager text NOT NULL DEFAULT '',
      fee_summary integer,
      source_file text NOT NULL DEFAULT '',
      excel_key text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS client_fee_import_pending_manager_idx
    ON client_fee_import_pending (manager)
  `;
}

function buildClientLookup(rows) {
  const byBiz = new Map();
  const byFull = new Map();
  const byName = new Map();

  for (const r of rows) {
    const biz = normBizNo(r.business_no);
    if (biz.length >= 10 && !byBiz.has(biz)) byBiz.set(biz, r.id);

    const full = `${String(r.company_name).trim()}||${String(r.manager).trim()}`;
    if (!byFull.has(full)) byFull.set(full, r.id);

    const nameKey = normalizeCompanyKey(r.company_name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, r.id);
  }

  return { byBiz, byFull, byName };
}

function resolveClientId(lookup, companyName, manager, businessNo) {
  const biz = normBizNo(businessNo);
  if (biz.length >= 10 && lookup.byBiz.has(biz)) return lookup.byBiz.get(biz);

  const trimmed = String(companyName ?? '').trim();
  if (manager) {
    const full = `${trimmed}||${String(manager).trim()}`;
    if (lookup.byFull.has(full)) return lookup.byFull.get(full);
  }

  const nameKey = normalizeCompanyKey(trimmed);
  if (nameKey && lookup.byName.has(nameKey)) return lookup.byName.get(nameKey);

  return null;
}

function findClientForFee(clientRows, companyName, manager) {
  const key = `${companyName}||${manager}`;
  const existing = clientRows.find(r => `${r.company_name}||${r.manager}` === key);
  if (existing) return existing;
  const nameKey = normalizeCompanyKey(companyName);
  return clientRows.find(r => normalizeCompanyKey(r.company_name) === nameKey) ?? null;
}

async function upsertInquiry(row, clientId, db) {
  const existing = await db`SELECT id FROM intake_inquiries WHERE excel_key = ${row.excelKey} LIMIT 1`;
  if (existing.length) {
    await db`
      UPDATE intake_inquiries SET client_id=${clientId}, company_name=${row.companyName}, phone=${row.phone},
        channel=${row.channel}, consultant=${row.consultant}, inquiry_date=${row.inquiryDate},
        inquiry_content=${row.inquiryContent}, contract_status=${row.contractStatus},
        proposed_fee=${row.proposedFee}, industry=${row.industry},
        business_no=${row.businessNo}, representative=${row.representative}, address=${row.address},
        extra=${db.json(row.extra)} WHERE id=${existing[0].id}
    `;
    return 'updated';
  }
  await db`
    INSERT INTO intake_inquiries (client_id, company_name, phone, channel, consultant, inquiry_date,
      inquiry_content, contract_status, proposed_fee, industry, business_no, representative, address, extra, excel_key)
    VALUES (${clientId}, ${row.companyName}, ${row.phone}, ${row.channel}, ${row.consultant}, ${row.inquiryDate},
      ${row.inquiryContent}, ${row.contractStatus}, ${row.proposedFee}, ${row.industry}, ${row.businessNo},
      ${row.representative}, ${row.address}, ${db.json(row.extra)}, ${row.excelKey})
  `;
  return 'inserted';
}

// --- fees-only ---
if (feesOnly) {
  await ensureFeePendingTable();

  const userRows = await sql`SELECT id, name FROM users`;
  const userByName = new Map(userRows.map(u => [u.name.trim(), u.id]));
  let clientRows = await sql`SELECT id, company_name, manager, business_no, status FROM clients`;
  let feeUpdated = 0;
  let feePending = 0;
  const skippedNameOnly = [];

  for (const c of data.clients) {
    if (isManagerNameOnlyRow(c)) {
      skippedNameOnly.push({
        companyName: c.companyName,
        representative: '',
        manager: c.manager,
        status: '',
      });
      continue;
    }

    const target = findClientForFee(clientRows, c.companyName, c.manager);
    const assignedUserId = userByName.get(c.manager) ?? null;
    const excelKey = `fee||${sourceBasename}||${c.companyName}||${c.manager}`;

    if (!target || target.status === 'intake') {
      await sql`
        INSERT INTO client_fee_import_pending (company_name, manager, fee_summary, source_file, excel_key)
        VALUES (${c.companyName}, ${c.manager}, ${c.feeSummary}, ${sourceBasename}, ${excelKey})
        ON CONFLICT (excel_key) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          manager = EXCLUDED.manager,
          fee_summary = EXCLUDED.fee_summary,
          source_file = EXCLUDED.source_file
      `;
      feePending++;
      continue;
    }

    await sql`
      UPDATE clients SET
        fee_summary = ${c.feeSummary},
        converted = ${c.converted},
        colbert = ${c.colbert},
        assigned_user_id = COALESCE(${assignedUserId}, assigned_user_id),
        updated_at = NOW()
      WHERE id = ${target.id}
    `;
    feeUpdated++;
  }

  reportSkippedRows(skippedNameOnly, { maxLog: 20 });
  await sql.end();
  console.log(`✓ 수임료 반영: updated=${feeUpdated}, pending=${feePending}`);
  process.exit(0);
}

// --- clients (수임처관리) — operational-only 시 건너뜀 ---
const userRows = await sql`SELECT id, name FROM users`;
const userByName = new Map(userRows.map(u => [u.name.trim(), u.id]));
let clientRows = await sql`SELECT id, company_name, manager, business_no, status FROM clients`;
let clientUpdated = 0;
let clientSkippedLink = 0;
const skippedNameOnly = [];

if (!operationalOnly) {
  for (const c of data.clients) {
    if (isManagerNameOnlyRow(c)) {
      skippedNameOnly.push({
        companyName: c.companyName,
        representative: '',
        manager: c.manager,
        status: '',
      });
      continue;
    }

    const target = findClientForFee(clientRows, c.companyName, c.manager);
    const assignedUserId = userByName.get(c.manager) ?? null;

    if (!target) {
      clientSkippedLink++;
      continue;
    }

    if (target.status === 'intake') continue;

    if (linkOnly) {
      await sql`
        UPDATE clients SET
          converted = ${c.converted},
          colbert = ${c.colbert},
          assigned_user_id = COALESCE(${assignedUserId}, assigned_user_id),
          updated_at = NOW()
        WHERE id = ${target.id}
      `;
    } else {
      await sql`
        UPDATE clients SET
          business_entity_type = ${c.businessEntityType},
          fee_summary = ${c.feeSummary},
          program = ${c.program},
          converted = ${c.converted},
          colbert = ${c.colbert},
          assigned_user_id = COALESCE(${assignedUserId}, assigned_user_id),
          updated_at = NOW()
        WHERE id = ${target.id}
      `;
    }
    clientUpdated++;
  }

  reportSkippedRows(skippedNameOnly, { maxLog: 20 });
}

clientRows = await sql`SELECT id, company_name, manager, business_no FROM clients`;
const clientLookup = buildClientLookup(clientRows);

const stats = { inserted: 0, updated: 0, skippedOps: 0 };
const skippedOps = [];

async function track(result) {
  if (result === 'inserted') stats.inserted++;
  else if (result === 'updated') stats.updated++;
  else stats.skippedOps++;
}

function shouldSkipOperationalRow(row) {
  return isManagerNameOnlyRow({
    companyName: row.companyName,
    representative: row.representative ?? '',
    businessNo: row.businessNo ?? '',
    manager: row.manager ?? '',
  });
}

// --- intake_inquiries / processes / churn ---
let churnCount = 0;
let processInquiryLinked = 0;
await sql.begin(async tx => {
  for (const row of data.inquiries) {
    if (shouldSkipOperationalRow(row)) {
      skippedOps.push({ type: 'inquiry', companyName: row.companyName, manager: row.consultant });
      await track('skipped');
      continue;
    }
    const clientId = resolveClientId(clientLookup, row.companyName, null, row.businessNo);
    await track(await upsertInquiry(row, clientId, tx));
  }

  for (const row of data.processes) {
    if (shouldSkipOperationalRow(row)) {
      skippedOps.push({ type: 'process', companyName: row.companyName });
      await track('skipped');
      continue;
    }
    const clientId = resolveClientId(clientLookup, row.companyName);
    let existing = await tx`SELECT id, checklist, excel_key FROM intake_processes WHERE excel_key = ${row.excelKey} LIMIT 1`;
    if (!existing.length) {
      existing = await tx`
        SELECT id, checklist, excel_key FROM intake_processes
        WHERE company_name = ${row.companyName}
        ORDER BY updated_at DESC LIMIT 1
      `;
    }
    const mergedChecklist = existing.length
      ? mergeChecklists(existing[0].checklist ?? {}, row.checklist)
      : row.checklist;

    if (existing.length) {
      await tx`
        UPDATE intake_processes SET client_id=${clientId}, company_name=${row.companyName},
          fee_start_date=${row.feeStartDate}, monthly_fee=${row.monthlyFee},
          channel=${row.channel}, checklist=${tx.json(mergedChecklist)},
          excel_key=${row.excelKey}, updated_at=NOW() WHERE id=${existing[0].id}
      `;
      await track('updated');
    } else {
      await tx`
        INSERT INTO intake_processes (client_id, company_name, fee_start_date, monthly_fee, channel, checklist, excel_key)
        VALUES (${clientId}, ${row.companyName}, ${row.feeStartDate}, ${row.monthlyFee}, ${row.channel}, ${tx.json(row.checklist)}, ${row.excelKey})
      `;
      await track('inserted');
    }
  }

  for (const row of data.churns) {
    if (shouldSkipOperationalRow(row)) {
      skippedOps.push({ type: 'churn', companyName: row.companyName, manager: row.manager });
      continue;
    }
    const clientId = resolveClientId(clientLookup, row.companyName, row.manager, row.businessNo);
    const existing = await tx`SELECT id FROM churn_records WHERE excel_key = ${row.excelKey} LIMIT 1`;
    const churnedAt = row.churnedAt ? new Date(row.churnedAt) : new Date();

    if (existing.length) {
      await tx`
        UPDATE churn_records SET client_id=${clientId}, company_name=${row.companyName}, reason=${row.reason},
          churn_type=${row.churnType}, data_cleanup=${row.dataCleanup}, early_sign=${row.earlySign},
          fee_amount=${row.feeAmount}, manager=${row.manager}, churned_at=${churnedAt}
        WHERE id=${existing[0].id}
      `;
    } else {
      await tx`
        INSERT INTO churn_records (client_id, company_name, reason, detail, churn_type, data_cleanup, early_sign,
          fee_amount, manager, churned_at, excel_key)
        VALUES (${clientId}, ${row.companyName}, ${row.reason}, '', ${row.churnType}, ${row.dataCleanup},
          ${row.earlySign}, ${row.feeAmount}, ${row.manager}, ${churnedAt}, ${row.excelKey})
      `;
    }

    if (clientId) {
      await tx`UPDATE clients SET status = 'churned', updated_at = NOW() WHERE id = ${clientId} AND status = 'active'`;
    }
    churnCount++;
  }

  const linkedInquiries = await tx`
    SELECT id, company_name, excel_key, extra
    FROM intake_inquiries
    WHERE coalesce(extra->>'draft', '') != 'true'
  `;
  for (const row of data.processes) {
    if (shouldSkipOperationalRow(row)) continue;
    if (linkedInquiries.some(i => inquiryMatchesProcess(i, row))) continue;
    const clientId = resolveClientId(clientLookup, row.companyName);
    await upsertInquiryFromProcess(row, clientId, tx);
    processInquiryLinked++;
  }
});

await sql.end();

if (!operationalOnly) {
  console.log(`✓ 수임처 보강: updated=${clientUpdated}, link-only skip=${clientSkippedLink}`);
}
console.log(`✓ 운영 데이터: inserted=${stats.inserted}, updated=${stats.updated}, skip=${stats.skippedOps}`);
if (processInquiryLinked > 0) {
  console.log(`✓ 프로세스 전용 → 유입관리 스텁 ${processInquiryLinked}건 연결`);
}
console.log(`✓ 유출: ${churnCount}건`);
if (skippedOps.length > 0) {
  console.log(`⚠ 운영 데이터 제외 ${skippedOps.length}건 (담당·이름만):`);
  for (const s of skippedOps.slice(0, 15)) {
    console.log(`  · [${s.type}] ${s.companyName}${s.manager ? ` / ${s.manager}` : ''}`);
  }
  if (skippedOps.length > 15) console.log(`  … 외 ${skippedOps.length - 15}건`);
}
console.log('  (수임처·유입·유출 시트 — 비품·미팅·체크리스트·가결산 제외)');
