/**
 * DB 전체 JSON 백업 (CLI) — 초기화 전 안전 백업용
 * node scripts/backup-db.mjs [출력경로.json]
 * 미지정 시 Desktop에 tax-analyzer-backup-YYYYMMDD-HHmmss.json 생성.
 * users.pin_hash는 [REDACTED] 처리.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

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

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const TABLES = [
  'users',
  'app_config',
  'clients',
  'client_contacts',
  'intake_inquiries',
  'intake_processes',
  'churn_records',
  'client_meetings',
  'report_deliveries',
  'settlement_visits',
  'work_checklists',
  'tax_filing_checks',
  'client_fee_changes',
  'client_fee_import_pending',
  'bluehole_sync_log',
  'lunch_spot_requests',
];

const sql = postgres(dbUrl, { max: 1 });

const tables = {};
for (const t of TABLES) {
  const exists = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${t} LIMIT 1
  `;
  if (exists.length === 0) {
    tables[t] = [];
    continue;
  }
  const rows = await sql.unsafe(`SELECT * FROM ${t}`);
  tables[t] = t === 'users'
    ? rows.map(r => ({ ...r, pin_hash: '[REDACTED]' }))
    : rows;
  console.log(`  ${t}: ${rows.length}건`);
}

await sql.end();

const now = new Date();
const stamp =
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
  `-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const outPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || root, 'Desktop', `tax-analyzer-backup-${stamp}.json`);

const payload = { exportedAt: now.toISOString(), version: 1, tables };
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`\n✓ 백업 저장: ${outPath}`);
