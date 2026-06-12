/**
 * 담당찾기(ver26.03.09).xls import 데이터 삭제
 * node scripts/delete-damdang-excel.mjs [--dry-run] [xls경로]
 *
 * - source=tp_import 수임처 (담당찾기 전용 insert)
 * - youth_excel 중 더존(douzone_export)과 상호 중복 + 엑셀 목록 포함
 * - public/data/contacts.json 해당 항목 제거
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const xlsPath =
  args[0] ||
  path.join(process.env.USERPROFILE || '', 'Desktop', '담당찾기(ver26.03.09).xls');

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

const COMPANY_HEADERS = ['상호', '업체명', '거래처', '상호명'];
const MANAGER_HEADERS = ['담당자', '담당'];

function normHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && value > 1000000000) return String(Math.trunc(value));
  return String(value).trim();
}

function normName(name) {
  return name.replace(/\s+/g, '').replace(/\(주\)|주식회사|㈜|\(유\)/gi, '').toLowerCase();
}

function parseExcelKeys(wb) {
  const keys = new Set();
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      if (row.map(normHeader).some(h => COMPANY_HEADERS.includes(h))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) continue;

    const col = { company: -1, manager: -1 };
    rows[headerIdx].forEach((cell, idx) => {
      const h = normHeader(cell);
      if (COMPANY_HEADERS.includes(h)) col.company = idx;
      else if (MANAGER_HEADERS.includes(h)) col.manager = idx;
    });
    if (col.company < 0) continue;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const companyName = cellText(row[col.company]);
      const manager = col.manager >= 0 ? cellText(row[col.manager]) : '';
      if (!companyName || companyName === '상호' || companyName.includes('검색어')) continue;
      keys.add(`${companyName}||${manager}`);
    }
  }
  return keys;
}

loadEnv();

if (!fs.existsSync(xlsPath)) {
  console.error('파일 없음:', xlsPath);
  process.exit(1);
}

const excelKeys = parseExcelKeys(XLSX.readFile(xlsPath));
console.log(`담당찾기 Excel: ${path.basename(xlsPath)} · ${excelKeys.size}건`);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });
const dbRows = await sql`SELECT id, company_name, manager, source, status FROM clients`;

const douzoneNormNames = new Set(
  dbRows.filter(r => r.source === 'douzone_export').map(r => normName(r.company_name)),
);

const toDelete = [];
for (const r of dbRows) {
  const key = `${r.company_name}||${r.manager}`;
  if (!excelKeys.has(key)) continue;

  if (r.source === 'tp_import') {
    toDelete.push(r);
    continue;
  }

  if (
    r.source === 'youth_excel'
    && r.status !== 'intake'
    && douzoneNormNames.has(normName(r.company_name))
  ) {
    toDelete.push(r);
  }
}

console.log(`삭제 대상: ${toDelete.length}건`);
const bySource = {};
for (const r of toDelete) {
  bySource[r.source] = (bySource[r.source] || 0) + 1;
  if (dryRun) console.log(`  [${r.source}] ${r.company_name} / ${r.manager}`);
}
console.log('  출처별:', bySource);

if (dryRun) {
  const contactsPath = path.join(root, 'public', 'data', 'contacts.json');
  if (fs.existsSync(contactsPath)) {
    const data = JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
    console.log(`contacts.json 제거 예정: ${data.contacts?.length ?? 0}건 → 0건`);
  }
  await sql.end();
  process.exit(0);
}

if (toDelete.length > 0) {
  const ids = toDelete.map(r => r.id);
  await sql`UPDATE intake_inquiries SET client_id = NULL WHERE client_id = ANY(${ids})`;
  await sql`UPDATE intake_processes SET client_id = NULL WHERE client_id = ANY(${ids})`;
  await sql`UPDATE churn_records SET client_id = NULL WHERE client_id = ANY(${ids})`;
  await sql`UPDATE client_meetings SET client_id = NULL WHERE client_id = ANY(${ids})`;
  await sql`UPDATE report_deliveries SET client_id = NULL WHERE client_id = ANY(${ids})`;
  await sql`UPDATE settlement_visits SET client_id = NULL WHERE client_id = ANY(${ids})`;
  const deleted = await sql`DELETE FROM clients WHERE id = ANY(${ids}) RETURNING id`;
  console.log(`✓ DB 삭제: ${deleted.length}건`);
} else {
  console.log('✓ DB: tp_import/중복 youth 없음 (이미 정리됨)');
}

const contactsPath = path.join(root, 'public', 'data', 'contacts.json');
if (fs.existsSync(contactsPath)) {
  const before = JSON.parse(fs.readFileSync(contactsPath, 'utf8')).contacts?.length ?? 0;
  fs.writeFileSync(
    contactsPath,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), contacts: [] }, null, 2),
  );
  console.log(`✓ contacts.json: ${before}건 → 0건`);
}

const after = await sql`SELECT source, count(*)::int as n FROM clients GROUP BY source ORDER BY source`;
console.log('남은 수임처:');
for (const r of after) console.log(`  ${r.source}: ${r.n}건`);

await sql.end();
