/**
 * 폐업일(closedDate)이 있는 수임처 → status=churned, statusLabel=폐업
 * node scripts/mark-closed-clients.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes('--dry-run');

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
  SELECT id, company_name, status, intake_data
  FROM clients
  WHERE coalesce(intake_data->>'closedDate', '') <> ''
`;

const toUpdate = candidates.filter(c => {
  const label = String(c.intake_data?.statusLabel ?? '').trim();
  return c.status !== 'churned' || label !== '폐업';
});

console.log(`폐업일 있음: ${candidates.length}건 · 갱신 대상: ${toUpdate.length}건${dryRun ? ' (dry-run)' : ''}`);

if (toUpdate.length === 0) {
  await sql.end();
  process.exit(0);
}

if (dryRun) {
  for (const c of toUpdate.slice(0, 15)) {
    console.log(`  - ${c.company_name} (${c.status} → churned, label=${c.intake_data?.statusLabel ?? '-'})`);
  }
  if (toUpdate.length > 15) console.log(`  … 외 ${toUpdate.length - 15}건`);
  await sql.end();
  process.exit(0);
}

let updated = 0;
for (const c of toUpdate) {
  const intakeData = {
    ...(c.intake_data ?? {}),
    statusLabel: '폐업',
  };
  await sql`
    UPDATE clients
    SET status = 'churned',
        intake_data = ${sql.json(intakeData)},
        updated_at = now()
    WHERE id = ${c.id}
  `;
  updated++;
}

console.log(`✓ ${updated}건 → churned / statusLabel=폐업`);
await sql.end();
