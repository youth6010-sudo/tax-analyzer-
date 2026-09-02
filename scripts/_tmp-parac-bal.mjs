import { readFileSync } from 'fs';
import postgres from 'postgres';

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const [e] = await sql`SELECT id, balance FROM arrears_entries WHERE external_code='01071'`;
const lines = await sql`
  SELECT description, amount, paid_amount, source FROM arrears_letter_lines
  WHERE arrears_entry_id=${e.id} ORDER BY sort_order`;
let open = 0;
for (const l of lines) {
  open += Number(l.amount) - Number(l.paid_amount);
}
console.log('linesOpen', open, 'balance', e.balance, 'diff', e.balance - open);
console.log('last lines:', lines.slice(-5));

await sql.end({ timeout: 5 });
