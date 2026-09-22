/**
 * 00234 팀코리아-회생채권: 원장 잔액 → 2022년 팀코리아 회생채권
 * node scripts/fix-teamkorea-rehab-label.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) o[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}
const env = { ...loadEnv(path.join(root, '.env')), ...loadEnv(path.join(root, '.env.local')) };
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 25 });

const NEW_DESC = '2022년 팀코리아 회생채권';

const [e] = await sql`
  SELECT id, external_code, company_name, balance
  FROM arrears_entries
  WHERE external_code = '00234' OR company_name ILIKE '%팀코리아%회생%'
  ORDER BY external_code
  LIMIT 1
`;
if (!e) {
  console.error('entry not found');
  process.exit(1);
}
const lines = await sql`
  SELECT id, description, amount, paid_amount
  FROM arrears_letter_lines
  WHERE arrears_entry_id = ${e.id}
  ORDER BY sort_order, id
`;
console.log(e.external_code, e.company_name, 'bal', e.balance, 'lines', lines.length);
for (const l of lines) console.log(' ', l.description, l.amount, l.paid_amount);

const targets = lines.filter(l => /원장\s*잔액/.test(String(l.description || '')));
if (!targets.length) {
  // already renamed?
  const already = lines.filter(l => String(l.description || '').includes('회생채권'));
  console.log(already.length ? 'already labeled' : 'no 원장 잔액 line');
  await sql.end({ timeout: 5 });
  process.exit(0);
}

for (const t of targets) {
  console.log(APPLY ? 'UPDATE' : 'would', t.id, t.description, '→', NEW_DESC);
  if (APPLY) {
    await sql`
      UPDATE arrears_letter_lines
      SET description = ${NEW_DESC}, updated_at = NOW()
      WHERE id = ${t.id}
    `;
  }
}
console.log(APPLY ? 'APPLIED' : 'DRY-RUN');
await sql.end({ timeout: 5 });
