/**
 * 청년들 ID.xlsx 전체 import (비품 주문 제외)
 * node scripts/import-youth-workbook.mjs [xlsx경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { detectYouthIdWorkbook, parseWorkbook } from './lib/youth-workbook-parse.mjs';

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

const xlsxPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', '청년들 ID.xlsx');

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

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, '');
}

function buildClientLookup(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = normalizeName(r.company_name);
    if (key && !map.has(key)) map.set(key, r.id);
    const full = `${r.company_name}||${r.manager}`;
    if (!map.has(full)) map.set(full, r.id);
  }
  return map;
}

function resolveClientId(lookup, companyName, manager) {
  const n = normalizeName(companyName);
  if (manager) {
    const full = `${companyName.trim()}||${manager.trim()}`;
    if (lookup.has(full)) return lookup.get(full);
  }
  if (lookup.has(n)) return lookup.get(n);
  for (const [k, id] of lookup) {
    if (k.includes(n) || n.includes(k)) return id;
  }
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

// --- clients (수임처관리) ---
const userRows = await sql`SELECT id, name FROM users`;
const userByName = new Map(userRows.map(u => [u.name.trim(), u.id]));
let clientRows = await sql`SELECT id, company_name, manager, status FROM clients`;
let clientInserted = 0;
let clientUpdated = 0;

for (const c of data.clients) {
  const key = `${c.companyName}||${c.manager}`;
  const existing = clientRows.find(r => `${r.company_name}||${r.manager}` === key);
  const assignedUserId = userByName.get(c.manager) ?? null;

  if (existing && (existing.status === 'intake' || existing.status === 'churned')) continue;

  if (existing) {
    await sql`
      UPDATE clients SET
        business_entity_type = ${c.businessEntityType},
        fee_summary = ${c.feeSummary},
        program = ${c.program},
        converted = ${c.converted},
        colbert = ${c.colbert},
        assigned_user_id = ${assignedUserId},
        source = 'youth_excel',
        updated_at = NOW()
      WHERE id = ${existing.id}
    `;
    clientUpdated++;
  } else {
    await sql`
      INSERT INTO clients (
        id, company_name, manager, business_entity_type, fee_summary, program,
        converted, colbert, status, source, assigned_user_id
      ) VALUES (
        ${randomUUID()}, ${c.companyName}, ${c.manager}, ${c.businessEntityType}, ${c.feeSummary},
        ${c.program}, ${c.converted}, ${c.colbert}, 'active', 'youth_excel', ${assignedUserId}
      )
    `;
    clientInserted++;
  }
}

clientRows = await sql`SELECT id, company_name, manager FROM clients`;
const clientLookup = buildClientLookup(clientRows);

const stats = { inserted: 0, updated: 0 };

async function track(result) {
  if (result === 'inserted') stats.inserted++;
  else stats.updated++;
}

// --- intake_inquiries ---
for (const row of data.inquiries) {
  const clientId = resolveClientId(clientLookup, row.companyName);
  await track(await upsertInquiry(row, clientId, sql));
}

// --- intake_processes ---
for (const row of data.processes) {
  const clientId = resolveClientId(clientLookup, row.companyName);
  const existing = await sql`SELECT id FROM intake_processes WHERE excel_key = ${row.excelKey} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE intake_processes SET client_id=${clientId}, fee_start_date=${row.feeStartDate}, monthly_fee=${row.monthlyFee},
        channel=${row.channel}, checklist=${sql.json(row.checklist)}, updated_at=NOW() WHERE id=${existing[0].id}
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
  const clientId = resolveClientId(clientLookup, row.companyName, row.manager);
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

console.log(`✓ 수임처: inserted=${clientInserted}, updated=${clientUpdated}`);
console.log(`✓ 운영 데이터: inserted=${stats.inserted}, updated=${stats.updated}`);
console.log(`✓ 유출: ${churnCount}건`);
console.log('  (수임처·유입·유출 시트만 — 비품·미팅·체크리스트·가결산 제외)');
