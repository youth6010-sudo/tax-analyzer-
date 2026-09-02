/**
 * 공문 마지막 월 vs 기준일 — 누락 후보 (파라씨앤디 유형)
 * node scripts/find-missing-tail-months.mjs
 */
import { readFileSync } from 'fs';
import postgres from 'postgres';

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const SKIP = new Set(['00183', '00199', '01600']); // inactive/신고대리

const entries = await sql`
  SELECT e.id, e.external_code, e.company_name, e.balance, e.debit, e.carry_in,
         e.manager_name, e.as_of_date
  FROM arrears_entries e
  WHERE e.balance <> 0 OR EXISTS (
    SELECT 1 FROM arrears_letter_lines l
    WHERE l.arrears_entry_id = e.id AND l.source = 'letter'
  )
`;

const allLines = await sql`
  SELECT arrears_entry_id, sort_order, description, amount, paid_amount, source
  FROM arrears_letter_lines
  WHERE source = 'letter' AND amount > 0
  ORDER BY arrears_entry_id, sort_order
`;

const byEntry = new Map();
for (const l of allLines) {
  const a = byEntry.get(l.arrears_entry_id) || [];
  a.push(l);
  byEntry.set(l.arrears_entry_id, a);
}

const MONTH_RE = /(20\d{2}|\d{2})년\s*(?:기타수수료\s*)?(\d{1,2})월/;

function lastMonthYm(lines) {
  let best = 0;
  let bestAmt = 0;
  let bestDesc = '';
  for (let i = 0; i < lines.length; i++) {
    const desc = lines[i].description;
    if (!/월/.test(desc)) continue;
    const mm = String(desc).replace(/\s+/g, '').match(MONTH_RE);
    if (!mm) continue;
    let y = Number(mm[1]);
    if (y < 100) y += 2000;
    const ym = y * 100 + Number(mm[2]);
    if (ym >= best) {
      best = ym;
      bestAmt = Math.round(lines[i].amount);
      bestDesc = desc;
    }
  }
  return { ym: best, amount: bestAmt, desc: bestDesc };
}

const openRows = await sql`
  SELECT arrears_entry_id, coalesce(sum(amount-paid_amount),0)::bigint AS open
  FROM arrears_letter_lines GROUP BY arrears_entry_id
`;
const openBy = new Map(openRows.map(r => [r.arrears_entry_id, Number(r.open)]));

const EXPECT_YM = 202608; // through Aug per asOf 2026-08-03
const candidates = [];

for (const e of entries) {
  if (SKIP.has(e.external_code)) continue;
  const lines = byEntry.get(e.id);
  if (!lines?.length) continue;
  const { ym, amount, desc } = lastMonthYm(lines);
  if (!ym || ym >= EXPECT_YM) continue;
  if (amount <= 0) continue;

  const missing = [];
  let ey = Math.floor(ym / 100);
  let em = (ym % 100) + 1;
  while (ey * 100 + em <= EXPECT_YM) {
    missing.push({ y: ey, m: em, amount });
    em++;
    if (em > 12) { em = 1; ey++; }
  }
  if (!missing.length) continue;

  const bal = Math.round(Number(e.balance));
  const open = openBy.get(e.id) ?? 0;
  const diff = bal - open;
  const missingSum = missing.reduce((s, x) => s + x.amount, 0);

  // parac-type: diff=0 but tail missing, OR diff equals missing sum
  const paracType = diff === 0 || diff === missingSum || (diff > 0 && diff <= missingSum);
  if (!paracType) continue;

  candidates.push({
    code: e.external_code,
    name: e.company_name,
    manager: e.manager_name,
    bal,
    open,
    diff,
    last: desc,
    lastYm: ym,
    missing,
    missingSum,
  });
}

candidates.sort((a, b) => b.missingSum - a.missingSum);
console.log('candidates', candidates.length);
for (const c of candidates) {
  console.log(
    `${c.code}\t${c.name}\t${c.manager}\tbal=${c.bal}\topen=${c.open}\tdiff=${c.diff}\tlast=${c.last}\tmissing=${c.missing.map(x => `${x.y}년${x.m}월(${x.amount})`).join(',')}`,
  );
}

await sql.end({ timeout: 5 });
