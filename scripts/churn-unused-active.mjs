/**
 * 대분류 미사용 + 상태 수임(active) 수임처 → 해임(churned) + 유출 이력 등록
 * node scripts/churn-unused-active.mjs [--dry-run]
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

const candidates = await sql`
  SELECT c.id, c.company_name, c.manager, c.fee_summary, c.status, c.intake_data
  FROM clients c
  LEFT JOIN churn_records cr ON cr.client_id = c.id
  WHERE c.status = 'active'
    AND trim(coalesce(c.intake_data->>'category', '')) = '미사용'
    AND trim(coalesce(c.intake_data->>'statusLabel', '')) = '수임'
    AND cr.id IS NULL
  ORDER BY c.company_name
`;

console.log(
  `대상: ${candidates.length}건 · 계약종료일 ${CHURNED_AT} · 사유 "${REASON}"${dryRun ? ' (dry-run)' : ''}`,
);

if (candidates.length === 0) {
  await sql.end();
  process.exit(0);
}

for (const c of candidates.slice(0, 20)) {
  console.log(`  - ${c.company_name} (${c.manager || '-'})`);
}
if (candidates.length > 20) console.log(`  … 외 ${candidates.length - 20}건`);

if (dryRun) {
  await sql.end();
  process.exit(0);
}

let updated = 0;
for (const c of candidates) {
  const intakeData = {
    ...(c.intake_data ?? {}),
    statusLabel: '해임',
    closedDate: '2025.12.31',
  };

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

  await sql`
    UPDATE clients
    SET status = 'churned',
        intake_data = ${sql.json(intakeData)},
        updated_at = now()
    WHERE id = ${c.id}
  `;
  updated += 1;
}

console.log(`✓ ${updated}건 → 해임 · 유출 이력 등록 완료`);
await sql.end();
