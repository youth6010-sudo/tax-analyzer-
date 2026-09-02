import { readFileSync } from 'fs';
import postgres from 'postgres';

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const entries = await sql`
  SELECT id, external_code, company_name, balance, carry_in, debit, credit, as_of_date, letter_date, manager_name, updated_by, updated_at
  FROM arrears_entries
  WHERE company_name ILIKE '%파라%' OR company_name ILIKE '%씨앤디%'
  ORDER BY company_name
`;
console.log('entries', JSON.stringify(entries, null, 2));

for (const e of entries) {
  const lines = await sql`
    SELECT sort_order, description, amount, paid_amount, paid_date, source, created_at
    FROM arrears_letter_lines
    WHERE arrears_entry_id = ${e.id}
    ORDER BY sort_order
  `;
  console.log(`\n=== ${e.company_name} (${e.external_code}) balance=${e.balance} lines=${lines.length} ===`);
  for (const l of lines) {
    if (/8월|08월|aug/i.test(l.description + l.paid_date) || l.amount > 0) {
      console.log(`  [${l.sort_order}] [${l.source}] ${l.description} | ${l.amount}/${l.paid_amount} | ${l.paid_date}`);
    }
  }
  const aug = lines.filter(l => /8월|08월/.test(String(l.description)));
  console.log('  8월 lines:', aug.length);
}

await sql.end({ timeout: 5 });
