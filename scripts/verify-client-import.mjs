/**
 * import 후 DB 상태 점검
 * node scripts/verify-client-import.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { CANONICAL_CATEGORIES } from './lib/suimcheo-export-parse.mjs';

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

const douzoneClients = await sql`
  SELECT count(*)::int AS n FROM clients WHERE source = 'douzone_export'
`;

const feeNullActive = await sql`
  SELECT count(*)::int AS n
  FROM clients
  WHERE status = 'active' AND fee_summary IS NULL
`;

const categoryRows = await sql`
  SELECT
    COALESCE(NULLIF(TRIM(intake_data->>'category'), ''), '(empty)') AS category,
    count(*)::int AS n
  FROM clients
  WHERE status IN ('active', 'churned')
  GROUP BY 1
  ORDER BY n DESC, category
`;

const allowed = new Set(CANONICAL_CATEGORIES);
const unknownCategories = categoryRows.filter(r => r.category !== '(empty)' && !allowed.has(r.category));

let exitCode = 0;

console.log('=== clients by source ===');
for (const r of bySource) console.log(`  ${r.source} / ${r.status}: ${r.n}`);

console.log('\n=== source summary ===');
console.log(`  douzone_export: ${douzoneClients[0].n}건`);
console.log(`  youth_excel: ${youthClients[0].n}건 (0 expected with --link-only)`);

console.log('\n=== orphan client_id ===');
console.log(`  inquiries: ${orphans[0].inquiries}`);
console.log(`  processes: ${orphans[0].processes}`);
console.log(`  churns: ${orphans[0].churns}`);
console.log(`  contacts: ${orphans[0].contacts}`);

console.log('\n=== active fee_summary NULL ===');
console.log(`  ${feeNullActive[0].n}건`);
if (feeNullActive[0].n > 0) {
  console.log('  ⚠ active 수임처 중 기장료 미입력 건이 있습니다.');
  exitCode = 1;
}

console.log('\n=== category distribution (active/churned) ===');
for (const r of categoryRows.slice(0, 20)) {
  const flag = r.category !== '(empty)' && !allowed.has(r.category) ? ' ⚠' : '';
  console.log(`  ${r.category}: ${r.n}${flag}`);
}
if (categoryRows.length > 20) console.log(`  … 외 ${categoryRows.length - 20}종`);

if (unknownCategories.length > 0) {
  console.log('\n=== non-canonical category (더존 대분류 점검 필요) ===');
  for (const r of unknownCategories) {
    console.log(`  ${r.category}: ${r.n}건`);
  }
  exitCode = 1;
}

const duplicateActive = await sql`
  SELECT company_name, manager, count(*)::int AS n
  FROM clients
  WHERE status = 'active'
  GROUP BY company_name, manager
  HAVING count(*) > 1
  ORDER BY n DESC
  LIMIT 20
`;

const intakeMobileOnly = await sql`
  SELECT count(*)::int AS n
  FROM clients c
  WHERE c.status IN ('active', 'intake')
    AND NULLIF(TRIM(c.intake_data->>'mobilePhone'), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM client_contacts cc
      WHERE cc.client_id = c.id
        AND NULLIF(TRIM(COALESCE(cc.mobile_phone, cc.phone)), '') IS NOT NULL
    )
`;

const orphanContacts = await sql`
  SELECT count(*)::int AS n FROM client_contacts cc
  LEFT JOIN clients c ON c.id = cc.client_id
  WHERE c.id IS NULL
`;

console.log('\n=== duplicate active (company+manager) ===');
if (duplicateActive.length === 0) {
  console.log('  none');
} else {
  for (const r of duplicateActive) {
    console.log(`  ${r.company_name} / ${r.manager}: ${r.n}건`);
  }
  exitCode = 1;
}

console.log('\n=== intake mobile without contact phone ===');
console.log(`  ${intakeMobileOnly[0].n}건`);
if (intakeMobileOnly[0].n > 0) {
  console.log('  ⚠ intake_data.mobilePhone만 있고 연락처 전화가 없는 건');
}

console.log('\n=== orphan contacts ===');
console.log(`  ${orphanContacts[0].n}건`);
if (orphanContacts[0].n > 0) exitCode = 1;

await sql.end();

if (youthClients[0].n > 0) {
  console.log('\n⚠ youth_excel source client가 있습니다. --link-only 없이 youth import 했을 수 있습니다.');
  exitCode = 1;
}

if (exitCode === 0) {
  console.log('\n✓ 검증 완료');
} else {
  console.log('\n⚠ 검증 완료 (경고 있음)');
  process.exit(exitCode);
}
