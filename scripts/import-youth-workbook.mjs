/**
 * 청년들 ID.xlsx 전체 import (비품 주문 제외)
 * node scripts/import-youth-workbook.mjs [--link-only] [xlsx경로]
 *
 * --link-only  수임처관리 시트로 client INSERT 금지, roster 필드(fee/program/구분) 덮어쓰기 금지
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { detectYouthIdWorkbook, parseWorkbook } from './lib/youth-workbook-parse.mjs';
import {
  isManagerNameOnlyRow,
  normBizNo,
  normalizeCompanyKey,
  reportSkippedRows,
} from './lib/client-import-guards.mjs';

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
const linkOnly = args.includes('--link-only');
const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
const xlsxPath =
  args.find(a => !a.startsWith('--')) ||
  path.join(desktop, '청년들 ID.xlsx');

if (!fs.existsSync(xlsxPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
if (!detectYouthIdWorkbook(wb.SheetNames)) {
  console.error('청년들 ID.xlsx 형식이 아닙니다.');
  process.exit(1);
}

const data = parseWorkbook(wb, XLSX);
console.log('파싱:', {
  clients: data.clients.length,
  inquiries: data.inquiries.length,
  processes: data.processes.length,
  churns: data.churns.length,
});
if (linkOnly) console.log('모드: --link-only (수임처 INSERT·roster 덮어쓰기 금지)');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

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

async function upsertInquiry(row, clientId, sql) {
  const existing = await sql`SELECT id FROM intake_inquiries WHERE excel_key = ${row.excelKey} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE intake_inquiries SET client_id=${clientId}, company_name=${row.companyName}, phone=${row.phone},
        channel=${row.channel}, consultant=${row.consultant}, inquiry_date=${row.inquiryDate},
        inquiry_content=${row.inquiryContent}, contract_status=${row.contractStatus},
        proposed_fee=${row.proposedFee}, industry=${row.industry},
        business_no=${row.businessNo}, representative=${row.representative}, address=${row.address},
        extra=${sql.json(row.extra)} WHERE id=${existing[0].id}
    `;
    return 'updated';
  }
  await sql`
    INSERT INTO intake_inquiries (client_id, company_name, phone, channel, consultant, inquiry_date,
      inquiry_content, contract_status, proposed_fee, industry, business_no, representative, address, extra, excel_key)
    VALUES (${clientId}, ${row.companyName}, ${row.phone}, ${row.channel}, ${row.consultant}, ${row.inquiryDate},
      ${row.inquiryContent}, ${row.contractStatus}, ${row.proposedFee}, ${row.industry}, ${row.businessNo},
      ${row.representative}, ${row.address}, ${sql.json(row.extra)}, ${row.excelKey})
  `;
  return 'inserted';
}

// --- clients (수임처관리) — 보강만 ---
const userRows = await sql`SELECT id, name FROM users`;
const userByName = new Map(userRows.map(u => [u.name.trim(), u.id]));
let clientRows = await sql`SELECT id, company_name, manager, business_no, status FROM clients`;
let clientUpdated = 0;
let clientSkippedLink = 0;
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

  const key = `${c.companyName}||${c.manager}`;
  const existing = clientRows.find(r => `${r.company_name}||${r.manager}` === key);
  const nameMatch = clientRows.find(
    r => normalizeCompanyKey(r.company_name) === normalizeCompanyKey(c.companyName),
  );
  const target = existing ?? nameMatch;
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

// --- intake_inquiries ---
for (const row of data.inquiries) {
  if (shouldSkipOperationalRow(row)) {
    skippedOps.push({ type: 'inquiry', companyName: row.companyName, manager: row.consultant });
    await track('skipped');
    continue;
  }
  const clientId = resolveClientId(clientLookup, row.companyName, null, row.businessNo);
  await track(await upsertInquiry(row, clientId, sql));
}

// --- intake_processes ---
for (const row of data.processes) {
  if (shouldSkipOperationalRow(row)) {
    skippedOps.push({ type: 'process', companyName: row.companyName });
    await track('skipped');
    continue;
  }
  const clientId = resolveClientId(clientLookup, row.companyName);
  let existing = await sql`SELECT id, checklist, excel_key FROM intake_processes WHERE excel_key = ${row.excelKey} LIMIT 1`;
  if (!existing.length) {
    existing = await sql`
      SELECT id, checklist, excel_key FROM intake_processes
      WHERE company_name = ${row.companyName}
      ORDER BY updated_at DESC LIMIT 1
    `;
  }
  const mergedChecklist = existing.length
    ? mergeChecklists(existing[0].checklist ?? {}, row.checklist)
    : row.checklist;

  if (existing.length) {
    await sql`
      UPDATE intake_processes SET client_id=${clientId}, company_name=${row.companyName},
        fee_start_date=${row.feeStartDate}, monthly_fee=${row.monthlyFee},
        channel=${row.channel}, checklist=${sql.json(mergedChecklist)},
        excel_key=${row.excelKey}, updated_at=NOW() WHERE id=${existing[0].id}
    `;
    await track('updated');
  } else {
    await sql`
      INSERT INTO intake_processes (client_id, company_name, fee_start_date, monthly_fee, channel, checklist, excel_key)
      VALUES (${clientId}, ${row.companyName}, ${row.feeStartDate}, ${row.monthlyFee}, ${row.channel}, ${sql.json(row.checklist)}, ${row.excelKey})
    `;
    await track('inserted');
  }
}

// --- churn_records ---
let churnCount = 0;
for (const row of data.churns) {
  if (shouldSkipOperationalRow(row)) {
    skippedOps.push({ type: 'churn', companyName: row.companyName, manager: row.manager });
    continue;
  }
  const clientId = resolveClientId(clientLookup, row.companyName, row.manager, row.businessNo);
  const existing = await sql`SELECT id FROM churn_records WHERE excel_key = ${row.excelKey} LIMIT 1`;
  const churnedAt = row.churnedAt ? new Date(row.churnedAt) : new Date();

  if (existing.length) {
    await sql`
      UPDATE churn_records SET client_id=${clientId}, company_name=${row.companyName}, reason=${row.reason},
        churn_type=${row.churnType}, data_cleanup=${row.dataCleanup}, early_sign=${row.earlySign},
        fee_amount=${row.feeAmount}, manager=${row.manager}, churned_at=${churnedAt}
      WHERE id=${existing[0].id}
    `;
  } else {
    await sql`
      INSERT INTO churn_records (client_id, company_name, reason, detail, churn_type, data_cleanup, early_sign,
        fee_amount, manager, churned_at, excel_key)
      VALUES (${clientId}, ${row.companyName}, ${row.reason}, '', ${row.churnType}, ${row.dataCleanup},
        ${row.earlySign}, ${row.feeAmount}, ${row.manager}, ${churnedAt}, ${row.excelKey})
    `;
  }

  if (clientId) {
    await sql`UPDATE clients SET status = 'churned', updated_at = NOW() WHERE id = ${clientId} AND status = 'active'`;
  }
  churnCount++;
}

await sql.end();

console.log(`✓ 수임처 보강: updated=${clientUpdated}, link-only skip=${clientSkippedLink}`);
console.log(`✓ 운영 데이터: inserted=${stats.inserted}, updated=${stats.updated}, skip=${stats.skippedOps}`);
console.log(`✓ 유출: ${churnCount}건`);
if (skippedOps.length > 0) {
  console.log(`⚠ 운영 데이터 제외 ${skippedOps.length}건 (담당·이름만):`);
  for (const s of skippedOps.slice(0, 15)) {
    console.log(`  · [${s.type}] ${s.companyName}${s.manager ? ` / ${s.manager}` : ''}`);
  }
  if (skippedOps.length > 15) console.log(`  … 외 ${skippedOps.length - 15}건`);
}
console.log('  (수임처·유입·유출 시트 — 비품·미팅·체크리스트·가결산 제외)');
