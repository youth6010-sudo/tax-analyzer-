/**
 * 더존 수임처 export → Postgres clients
 * node scripts/import-suimcheo.mjs [--replace] [xlsx경로]
 *
 * --replace  active/churned 수임처를 엑셀 기준으로 교체 (사업자번호 일치 시 client_id 유지)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { detectSuimcheoExport, parseSuimcheoExportRows } from './lib/suimcheo-export-parse.mjs';
import { filterImportableClients, normBizNo, reportSkippedRows } from './lib/client-import-guards.mjs';

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
const replace = args.includes('--replace');
const xlsxPath =
  args.find(a => !a.startsWith('--')) ||
  path.join(process.env.USERPROFILE || '', 'Desktop', '수임처-20260618153548.xlsx');

if (!fs.existsSync(xlsxPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const sheetName = wb.SheetNames.find(n => {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
  return detectSuimcheoExport(rows);
});

if (!sheetName) {
  console.error('수임처 export 형식이 아닙니다. (상호·사업자등록번호·상태 열 필요)');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
const parsed = parseSuimcheoExportRows(rows);
const { importable: clients, skipped: skippedRows } = filterImportableClients(parsed, {
  label: 'TP 수임처 export',
});

const active = clients.filter(c => c.status === 'active').length;
const churned = clients.filter(c => c.status === 'churned').length;
console.log(
  `파싱: ${parsed.length}건 → 반영 ${clients.length}건 (수임 ${active}, 해임 ${churned}), 제외 ${skippedRows.length}건 ← ${path.basename(xlsxPath)}`,
);
reportSkippedRows(skippedRows);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

const userRows = await sql`SELECT id, name, real_name FROM users`;
const userByNick = new Map(userRows.map(u => [u.name.trim(), u.id]));
const userByReal = new Map(userRows.map(u => [u.real_name.trim(), u.id]));

async function detachClientLinks(clientId) {
  await sql`UPDATE intake_inquiries SET client_id = NULL WHERE client_id = ${clientId}`;
  await sql`UPDATE intake_processes SET client_id = NULL WHERE client_id = ${clientId}`;
  await sql`UPDATE churn_records SET client_id = NULL WHERE client_id = ${clientId}`;
  await sql`UPDATE client_meetings SET client_id = NULL WHERE client_id = ${clientId}`;
  await sql`UPDATE report_deliveries SET client_id = NULL WHERE client_id = ${clientId}`;
  await sql`UPDATE settlement_visits SET client_id = NULL WHERE client_id = ${clientId}`;
}

function mergeKey(companyName, manager) {
  return `${companyName.trim()}||${manager.trim()}`;
}

const clientValues = (id, c, assignedUserId) => ({
  id,
  companyName: c.companyName,
  manager: c.manager,
  representative: c.representative,
  businessNo: c.businessNo,
  corporateNo: c.corporateNo,
  residentNo: c.residentNo,
  phone: c.phone,
  fax: c.fax,
  taxTypes: c.taxTypes,
  businessEntityType: c.businessEntityType,
  feeSummary: null,
  program: c.program,
  status: c.status,
  assignedUserId,
  intakeData: c.intakeData,
  converted: c.converted,
});

async function upsertClient(row) {
  await sql`
    INSERT INTO clients (
      id, company_name, manager, representative, business_no, corporate_no, resident_no,
      phone, fax, tax_types, business_entity_type, fee_summary, program, status,
      assigned_user_id, intake_data, source, converted
    ) VALUES (
      ${row.id}, ${row.companyName}, ${row.manager}, ${row.representative}, ${row.businessNo},
      ${row.corporateNo}, ${row.residentNo}, ${row.phone}, ${row.fax}, ${sql.json(row.taxTypes)},
      ${row.businessEntityType}, ${row.feeSummary}, ${row.program}, ${row.status},
      ${row.assignedUserId}, ${sql.json(row.intakeData)}, 'douzone_export', ${row.converted}
    )
    ON CONFLICT (id) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      manager = EXCLUDED.manager,
      representative = EXCLUDED.representative,
      business_no = EXCLUDED.business_no,
      corporate_no = EXCLUDED.corporate_no,
      resident_no = EXCLUDED.resident_no,
      phone = EXCLUDED.phone,
      fax = EXCLUDED.fax,
      tax_types = EXCLUDED.tax_types,
      business_entity_type = EXCLUDED.business_entity_type,
      program = EXCLUDED.program,
      status = EXCLUDED.status,
      assigned_user_id = EXCLUDED.assigned_user_id,
      intake_data = EXCLUDED.intake_data,
      source = 'douzone_export',
      converted = EXCLUDED.converted,
      updated_at = NOW()
  `;
}

let inserted = 0;
let updated = 0;
let deleted = 0;
let idsReused = 0;

if (replace) {
  const existingRows = await sql`
    SELECT id, company_name, manager, business_no, status
    FROM clients
    WHERE status IN ('active', 'churned')
  `;

  const byBiz = new Map();
  const byKey = new Map();
  for (const r of existingRows) {
    const biz = normBizNo(r.business_no);
    if (biz.length >= 10 && !byBiz.has(biz)) byBiz.set(biz, r.id);
    const key = mergeKey(r.company_name, r.manager);
    if (!byKey.has(key)) byKey.set(key, r.id);
  }

  const importIds = new Set();

  for (const c of clients) {
    const assignedUserId =
      userByNick.get(c.manager) ?? userByReal.get(c.managerReal) ?? null;

    const biz = normBizNo(c.businessNo);
    const key = mergeKey(c.companyName, c.manager);
    const existingId =
      (biz.length >= 10 ? byBiz.get(biz) : null) ?? byKey.get(key) ?? null;
    const id = existingId ?? randomUUID();

    if (existingId) idsReused++;
    importIds.add(id);

    const row = clientValues(id, c, assignedUserId);
    if (existingId) {
      await upsertClient(row);
      updated++;
    } else {
      await upsertClient(row);
      inserted++;
    }
  }

  const toDelete = existingRows.filter(r => !importIds.has(r.id));
  if (toDelete.length > 0) {
    console.log(`엑셀에 없는 active/churned ${toDelete.length}건 삭제 중…`);
    for (const r of toDelete) {
      await detachClientLinks(r.id);
    }
    await sql`DELETE FROM clients WHERE id IN ${sql(toDelete.map(r => r.id))}`;
    deleted = toDelete.length;
  }

  console.log(`  ID 재사용: ${idsReused}건 (사업자번호·상호+담당 매칭)`);
} else {
  for (const c of clients) {
    const assignedUserId =
      userByNick.get(c.manager) ?? userByReal.get(c.managerReal) ?? null;
    await upsertClient(clientValues(randomUUID(), c, assignedUserId));
    inserted++;
  }
}

await sql.end();
console.log(
  `✓ DB: ${replace ? '교체' : '추가'} upsert ${inserted + updated}건 (신규 ${inserted}, 갱신 ${updated}, 삭제 ${deleted}) · 정본 douzone_export`,
);
