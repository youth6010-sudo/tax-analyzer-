/**
 * 수임처·유입·유출·연관 시트 데이터 전량 삭제
 * node scripts/wipe-all-client-data.mjs --confirm
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

if (!process.argv.includes('--confirm')) {
  console.error('⚠️  모든 업체·유입·유출 데이터가 삭제됩니다.');
  console.error('실행: node scripts/wipe-all-client-data.mjs --confirm');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function wipe(label, query) {
  const rows = await query;
  console.log(`  ${label}: ${rows.length}건 삭제`);
  return rows.length;
}

async function wipeIfExists(table) {
  const exists = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
    LIMIT 1
  `;
  if (exists.length === 0) {
    console.log(`  ${table}: (테이블 없음, 건너뜀)`);
    return 0;
  }
  return wipe(table, sql.unsafe(`DELETE FROM ${table} RETURNING id`));
}

console.log('업체 관련 데이터 전량 삭제 중… (상담 초안은 보존)');

await wipe('tax_filing_checks', sql`DELETE FROM tax_filing_checks RETURNING id`);
await wipeIfExists('client_fee_changes');
await wipeIfExists('client_fee_import_pending');
await wipe('churn_records', sql`DELETE FROM churn_records RETURNING id`);
await wipe('intake_processes', sql`DELETE FROM intake_processes RETURNING id`);
// 상담 초안(extra.draft = true)은 보존하고 나머지 유입관리 행만 삭제
await wipe(
  'intake_inquiries (초안 제외)',
  sql`DELETE FROM intake_inquiries WHERE coalesce(extra->>'draft', '') <> 'true' RETURNING id`,
);
await wipe('client_meetings', sql`DELETE FROM client_meetings RETURNING id`);
await wipe('report_deliveries', sql`DELETE FROM report_deliveries RETURNING id`);
await wipe('settlement_visits', sql`DELETE FROM settlement_visits RETURNING id`);
await wipe('client_contacts', sql`DELETE FROM client_contacts RETURNING id`);
// 보존된 초안이 삭제 예정 clients를 참조하면 FK 위반 → 참조 해제
await sql`UPDATE intake_inquiries SET client_id = NULL WHERE client_id IS NOT NULL`;
await wipe('clients', sql`DELETE FROM clients RETURNING id`);

const verify = await sql`
  SELECT
    (SELECT count(*)::int FROM clients) AS clients,
    (SELECT count(*)::int FROM intake_inquiries WHERE coalesce(extra->>'draft', '') <> 'true') AS inquiries,
    (SELECT count(*)::int FROM intake_inquiries WHERE coalesce(extra->>'draft', '') = 'true') AS kept_drafts,
    (SELECT count(*)::int FROM intake_processes) AS processes,
    (SELECT count(*)::int FROM churn_records) AS churn,
    (SELECT count(*)::int FROM client_contacts) AS contacts
`;

console.log('\n검증 (kept_drafts 외 모두 0이어야 함):', verify[0]);
await sql.end();
console.log('완료.');
