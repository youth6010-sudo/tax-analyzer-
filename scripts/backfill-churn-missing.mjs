/**
 * 유출(status=churned)이지만 churn_records가 없는 수임처에 유출 이력 일괄 등록.
 * node scripts/backfill-churn-missing.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes('--dry-run');

const CHURNED_AT = '2025-12-31';
const REASON = 'TP 코드정리';

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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const missing = await sql`
  SELECT c.id, c.company_name, c.manager, c.fee_summary
  FROM clients c
  LEFT JOIN churn_records cr ON cr.client_id = c.id
  WHERE c.status = 'churned' AND cr.id IS NULL
  ORDER BY c.company_name
`;

console.log(
  `유출 이력 없음: ${missing.length}건 · 계약종료일 ${CHURNED_AT} · 사유 "${REASON}"${dryRun ? ' (dry-run)' : ''}`,
);

if (missing.length === 0) {
  await sql.end();
  process.exit(0);
}

for (const c of missing.slice(0, 10)) {
  console.log(`  - ${c.company_name} (${c.manager || '-'})`);
}
if (missing.length > 10) console.log(`  … 외 ${missing.length - 10}건`);

if (dryRun) {
  await sql.end();
  process.exit(0);
}

let inserted = 0;
for (const c of missing) {
  await sql`
    INSERT INTO churn_records (
      client_id, company_name, manager, reason, detail,
      churn_type, data_cleanup, early_sign, fee_amount, churned_at
    ) VALUES (
      ${c.id},
      ${c.company_name ?? ''},
      ${c.manager ?? ''},
      ${REASON},
      '',
      '',
      '',
      '',
      ${c.fee_summary},
      ${CHURNED_AT}::timestamptz
    )
  `;
  inserted += 1;
}

console.log(`✓ ${inserted}건 유출 이력 등록 완료`);
await sql.end();
