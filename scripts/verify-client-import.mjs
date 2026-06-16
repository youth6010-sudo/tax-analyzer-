/**
 * import 후 DB 상태 점검
 * node scripts/verify-client-import.mjs
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

const sql = postgres(dbUrl, { max: 1 });

const bySource = await sql`
  SELECT source, status, count(*)::int AS n
  FROM clients
  GROUP BY source, status
  ORDER BY source, status
`;

const orphans = await sql`
  SELECT
    (SELECT count(*)::int FROM intake_inquiries WHERE client_id IS NULL) AS inquiries,
    (SELECT count(*)::int FROM intake_processes WHERE client_id IS NULL) AS processes,
    (SELECT count(*)::int FROM churn_records WHERE client_id IS NULL) AS churns,
    (SELECT count(*)::int FROM client_contacts) AS contacts
`;

const youthClients = await sql`
  SELECT count(*)::int AS n FROM clients WHERE source = 'youth_excel'
`;

console.log('=== clients by source ===');
for (const r of bySource) console.log(`  ${r.source} / ${r.status}: ${r.n}`);

console.log('\n=== orphan client_id ===');
console.log(`  inquiries: ${orphans[0].inquiries}`);
console.log(`  processes: ${orphans[0].processes}`);
console.log(`  churns: ${orphans[0].churns}`);
console.log(`  contacts: ${orphans[0].contacts}`);

console.log('\n=== youth_excel clients (0 expected with --link-only) ===');
console.log(`  ${youthClients[0].n}건`);

await sql.end();

if (youthClients[0].n > 0) {
  console.log('\n⚠ youth_excel source client가 있습니다. --link-only 없이 youth import 했을 수 있습니다.');
  process.exit(1);
}

console.log('\n✓ 검증 완료');
