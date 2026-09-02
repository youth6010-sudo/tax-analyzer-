/**
 * 공문 내역합(linesOpen)과 원장 잔액 불일치 — 소액·공문 있음 건 잔액 동기화
 * node scripts/sync-balance-to-letter-open.mjs [--apply]
 */
import { readFileSync } from 'fs';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const MAX_DIFF = 880_000; // 최대 ~2개월분
const SKIP = new Set(['00183', '00199', '01600', '01418', '00941', '01804', '00647', '00131']);

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const rows = await sql`
  SELECT e.id, e.external_code, e.company_name, e.balance,
         coalesce(sum(l.amount - l.paid_amount), 0)::bigint AS open,
         bool_or(l.source = 'letter') AS has_letter
  FROM arrears_entries e
  LEFT JOIN arrears_letter_lines l ON l.arrears_entry_id = e.id
  GROUP BY e.id
  HAVING bool_or(l.source = 'letter') = true
`;

const plans = [];
for (const r of rows) {
  if (SKIP.has(r.external_code)) continue;
  const bal = Math.round(Number(r.balance));
  const open = Math.round(Number(r.open));
  const diff = bal - open;
  if (diff === 0) continue;
  if (Math.abs(diff) > MAX_DIFF) continue;
  plans.push({ id: r.id, code: r.external_code, name: r.company_name, bal, open, diff });
}

plans.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
console.log(`sync candidates ${plans.length} apply=${APPLY}`);
for (const p of plans) {
  console.log(`${p.code}\t${p.name}\t${p.bal} → ${p.open}\tdiff=${p.diff}`);
}

if (APPLY) {
  for (const p of plans) {
    await sql`
      UPDATE arrears_entries SET balance = ${p.open}, updated_by = 'sync-letter-open', updated_at = now()
      WHERE id = ${p.id}
    `;
  }
  console.log('updated', plans.length);
}

await sql.end({ timeout: 5 });
