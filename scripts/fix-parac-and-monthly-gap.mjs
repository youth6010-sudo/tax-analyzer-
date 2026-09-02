/**
 * (주)파라씨앤디 — 공문 2026년 7·8월 기장료 누락 보충
 * Usage: node scripts/fix-parac-and-monthly-gap.mjs
 */
import { readFileSync } from 'fs';
import postgres from 'postgres';

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const CODE = '01071';
const MONTHLY = 165_000;
const TO_ADD = [
  { description: '2026년 7월', amount: MONTHLY },
  { description: '2026년 8월', amount: MONTHLY },
];

const [entry] = await sql`
  SELECT id, company_name, balance FROM arrears_entries WHERE external_code = ${CODE} LIMIT 1
`;
if (!entry) {
  console.error('not found', CODE);
  process.exit(1);
}

const lines = await sql`
  SELECT sort_order, description, amount, paid_amount
  FROM arrears_letter_lines WHERE arrears_entry_id = ${entry.id}
  ORDER BY sort_order
`;

const have = new Set(lines.map(l => String(l.description).replace(/\s+/g, '')));
const missing = TO_ADD.filter(t => !have.has(t.description.replace(/\s+/g, '')));
if (!missing.length) {
  console.log('already has 7·8월 lines');
  await sql.end({ timeout: 5 });
  process.exit(0);
}

let sort = lines.length ? Math.max(...lines.map(l => l.sort_order)) + 1 : 0;
for (const row of missing) {
  await sql`
    INSERT INTO arrears_letter_lines (
      arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
    ) VALUES (
      ${entry.id}, ${sort}, ${row.description}, ${row.amount}, 0, '', 'letter'
    )
  `;
  sort += 1;
  console.log('added', row.description, row.amount);
}

const [{ open }] = await sql`
  SELECT coalesce(sum(amount - paid_amount), 0)::int AS open
  FROM arrears_letter_lines WHERE arrears_entry_id = ${entry.id}
`;
await sql`
  UPDATE arrears_entries SET
    balance = ${open},
    updated_by = 'fix-parac-monthly-gap',
    updated_at = now()
  WHERE id = ${entry.id}
`;
console.log(`${entry.company_name}: balance ${entry.balance} → ${open}`);
await sql.end({ timeout: 5 });
