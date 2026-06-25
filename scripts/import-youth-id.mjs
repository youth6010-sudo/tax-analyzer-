/**
 * 청년들 ID.xlsx → Postgres clients (수임처관리 정본)
 * node scripts/import-youth-id.mjs [xlsx경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { parseSuimcheoRows, detectYouthIdWorkbook, detectSuimcheoManagementLayout } from './lib/youth-id-parse.mjs';

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
const getSheetRows = name =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
if (!detectYouthIdWorkbook(wb.SheetNames, getSheetRows)) {
  console.error('청년들 ID.xlsx 형식이 아닙니다. (수임처관리·청년들ID 또는 수임처관리 블록 레이아웃 필요)');
  process.exit(1);
}

const rows = wb.Sheets['수임처관리']
  ? getSheetRows('수임처관리')
  : (wb.SheetNames.map(name => getSheetRows(name)).find(r => detectSuimcheoManagementLayout(r)) ?? []);
const clients = parseSuimcheoRows(rows);
console.log(`수임처관리 파싱: ${clients.length}건`);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });
const userRows = await sql`SELECT id, name FROM users`;
const userByName = new Map(userRows.map(u => [u.name.trim(), u.id]));
const existingRows = await sql`SELECT id, company_name, manager, status FROM clients`;

let inserted = 0;
let updated = 0;
let skipped = 0;

for (const c of clients) {
  const key = `${c.companyName}||${c.manager}`;
  const existing = existingRows.find(r => `${r.company_name}||${r.manager}` === key);
  const assignedUserId = userByName.get(c.manager) ?? null;

  if (existing && (existing.status === 'intake' || existing.status === 'churned')) {
    skipped++;
    continue;
  }

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
    updated++;
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
    inserted++;
  }
}

await sql.end();
console.log(`✓ DB: inserted=${inserted}, updated=${updated}, skipped=${skipped}`);
console.log('  정본: youth_excel · 보조 TP: npm run import:contacts');
