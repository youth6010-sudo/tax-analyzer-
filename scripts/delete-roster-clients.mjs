/**
 * 유입·유출에 연결된 수임처를 제외한 나머지(active roster 등) 삭제
 *
 * 유지: status intake/churned, intake_inquiries/processes/churn_records.client_id
 *
 * node scripts/delete-roster-clients.mjs           # dry-run
 * node scripts/delete-roster-clients.mjs --confirm # 실행
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const confirm = process.argv.includes('--confirm');

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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const keepRows = await sql`
  SELECT DISTINCT c.id, c.company_name, c.status
  FROM clients c
  WHERE c.status IN ('intake', 'churned')
     OR EXISTS (SELECT 1 FROM intake_inquiries i WHERE i.client_id = c.id)
     OR EXISTS (SELECT 1 FROM intake_processes p WHERE p.client_id = c.id)
     OR EXISTS (SELECT 1 FROM churn_records ch WHERE ch.client_id = c.id)
  ORDER BY c.status, c.company_name
`;

const keepIds = keepRows.map(r => r.id);
const allCount = await sql`SELECT count(*)::int AS n FROM clients`;

let deletePreview = [];
if (keepIds.length === 0) {
  deletePreview = await sql`
    SELECT id, company_name, status, manager FROM clients ORDER BY company_name LIMIT 20
  `;
} else {
  deletePreview = await sql`
    SELECT id, company_name, status, manager
    FROM clients
    WHERE id NOT IN ${sql(keepIds)}
    ORDER BY company_name
    LIMIT 20
  `;
}

const deleteCount = allCount[0].n - keepRows.length;

console.log(`전체 수임처: ${allCount[0].n}건`);
console.log(`유지 (유입·유출): ${keepRows.length}건`);
console.log(`삭제 예정: ${deleteCount}건`);

const statusCounts = {};
for (const r of keepRows) {
  statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
}
for (const [st, n] of Object.entries(statusCounts)) {
  console.log(`  유지 · ${st}: ${n}건`);
}

if (deleteCount > 0) {
  console.log('\n삭제 대상 샘플 (최대 20건):');
  for (const r of deletePreview) {
    console.log(`  - [${r.status}] ${r.company_name} (${r.manager || '담당 없음'})`);
  }
  if (deleteCount > 20) console.log(`  … 외 ${deleteCount - 20}건`);
}

if (!confirm) {
  console.log('\n⚠️  dry-run — 실제 삭제: node scripts/delete-roster-clients.mjs --confirm');
  await sql.end();
  process.exit(0);
}

if (deleteCount === 0) {
  console.log('\n삭제할 수임처가 없습니다.');
  await sql.end();
  process.exit(0);
}

console.log('\n삭제 진행 중…');

await sql.begin(async tx => {
  const detach = async (table, label) => {
    const rows = await tx.unsafe(
      `UPDATE ${table} SET client_id = NULL WHERE ${keepIds.length === 0 ? 'client_id IS NOT NULL' : `client_id IS NOT NULL AND client_id NOT IN (${keepIds.map((_, i) => `$${i + 1}`).join(', ')})`} RETURNING id`,
      keepIds,
    );
    console.log(`  ${label}: 연결 해제 ${rows.length}건`);
  };

  await detach('intake_inquiries', 'intake_inquiries');
  await detach('intake_processes', 'intake_processes');
  await detach('churn_records', 'churn_records');
  await detach('client_meetings', 'client_meetings');
  await detach('report_deliveries', 'report_deliveries');
  await detach('settlement_visits', 'settlement_visits');

  const deleted =
    keepIds.length === 0
      ? await tx`DELETE FROM clients RETURNING id`
      : await tx`DELETE FROM clients WHERE id NOT IN ${tx(keepIds)} RETURNING id`;

  console.log(`  clients: ${deleted.length}건 삭제`);
});

const verify = await sql`
  SELECT
    (SELECT count(*)::int FROM clients) AS clients,
    (SELECT count(*)::int FROM intake_inquiries) AS inquiries,
    (SELECT count(*)::int FROM intake_processes) AS processes,
    (SELECT count(*)::int FROM churn_records) AS churn
`;

console.log('\n검증:', verify[0]);
await sql.end();
console.log('완료.');
