/**
 * 더존 수임처 export → Postgres clients
 * node scripts/import-suimcheo.mjs [--replace] [xlsx경로]
 *
 * --replace  기존 active/churned 수임처 전부 삭제 후 엑셀 기준으로 새로 적재
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { detectSuimcheoExport, parseSuimcheoExportRows } from './lib/suimcheo-export-parse.mjs';
import { filterImportableClients, reportSkippedRows } from './lib/client-import-guards.mjs';

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
  path.join(process.env.USERPROFILE || '', 'Desktop', '수임처-20260612.xlsx');

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

if (replace) {
  console.log('기존 수임처(active/churned) 삭제 중…');
  await sql`UPDATE intake_inquiries SET client_id = NULL WHERE client_id IS NOT NULL`;
  await sql`UPDATE intake_processes SET client_id = NULL WHERE client_id IS NOT NULL`;
  await sql`UPDATE churn_records SET client_id = NULL WHERE client_id IS NOT NULL`;
  await sql`UPDATE client_meetings SET client_id = NULL WHERE client_id IS NOT NULL`;
  await sql`UPDATE report_deliveries SET client_id = NULL WHERE client_id IS NOT NULL`;
  await sql`UPDATE settlement_visits SET client_id = NULL WHERE client_id IS NOT NULL`;
  const deleted = await sql`DELETE FROM clients WHERE status IN ('active', 'churned') RETURNING id`;
  console.log(`  삭제: ${deleted.length}건 (유입중 intake는 유지)`);
}

let inserted = 0;

for (const c of clients) {
  const assignedUserId =
    userByNick.get(c.manager) ?? userByReal.get(c.managerReal) ?? null;

  await sql`
    INSERT INTO clients (
      id, company_name, manager, representative, business_no, corporate_no, resident_no,
      phone, fax, tax_types, business_entity_type, fee_summary, program, status,
      assigned_user_id, intake_data, source, converted
    ) VALUES (
      ${randomUUID()}, ${c.companyName}, ${c.manager}, ${c.representative}, ${c.businessNo},
      ${c.corporateNo}, ${c.residentNo}, ${c.phone}, ${c.fax}, ${sql.json(c.taxTypes)},
      ${c.businessEntityType}, ${c.feeSummary}, ${c.program}, ${c.status},
      ${assignedUserId}, ${sql.json(c.intakeData)}, 'douzone_export', ${c.converted}
    )
  `;
  inserted++;
}

await sql.end();
console.log(`✓ DB: ${replace ? '교체' : '추가'} 적재 ${inserted}건 · 정본 douzone_export`);
