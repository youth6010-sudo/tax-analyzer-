/**
 * 2026년 6월까지 공문 후 7·8월 누락 보충 (파라씨앤디 유형)
 * node scripts/fix-missing-2026-tail-months.mjs [--apply]
 */
import { readFileSync } from 'fs';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const SKIP = new Set(['00183', '00199', '01600', '01071']); // inactive + already fixed parac

const MONTH_RE = /(20\d{2}|\d{2})년\s*(?:기타수수료\s*)?(\d{1,2})월/;

function parseYm(desc) {
  const d = String(desc || '').replace(/\s+/g, ' ');
  const mm = d.match(MONTH_RE);
  if (!mm) return 0;
  let y = Number(mm[1]);
  if (y < 100) y += 2000;
  return y * 100 + Number(mm[2]);
}

function formatMonth(y, mo) {
  return `${y}년 ${mo}월`;
}

const entries = await sql`
  SELECT id, external_code, company_name, balance
  FROM arrears_entries
  WHERE balance > 0
`;

const lines = await sql`
  SELECT arrears_entry_id, sort_order, description, amount, paid_amount, source
  FROM arrears_letter_lines
  ORDER BY arrears_entry_id, sort_order
`;
const byEntry = new Map();
for (const l of lines) {
  const a = byEntry.get(l.arrears_entry_id) || [];
  a.push(l);
  byEntry.set(l.arrears_entry_id, a);
}

const plans = [];

for (const e of entries) {
  if (SKIP.has(e.external_code)) continue;
  const all = byEntry.get(e.id) || [];
  const letterCharges = all.filter(l => l.source === 'letter' && Math.round(l.amount) > 0 && /월/.test(l.description));
  if (letterCharges.length < 3) continue;

  let lastYm = 0;
  let lastAmt = 0;
  let lastDesc = '';
  for (const l of letterCharges) {
    const ym = parseYm(l.description);
    if (ym >= lastYm) {
      lastYm = ym;
      lastAmt = Math.round(l.amount);
      lastDesc = l.description;
    }
  }
  // 2026년 5~6월까지인데 7·8월 없음
  if (lastYm < 202605 || lastYm > 202606) continue;

  const recent = letterCharges
    .filter(l => parseYm(l.description) >= lastYm - 2)
    .map(l => Math.round(l.amount));
  if (recent.length < 2) continue;
  const mode = recent.sort((a, b) => recent.filter(x => x === a).length - recent.filter(x => x === b).length).pop();
  if (!mode || recent.filter(a => a === mode).length < 2) continue;

  const toAdd = [];
  for (const targetYm of [202607, 202608]) {
    if (targetYm <= lastYm) continue;
    const y = Math.floor(targetYm / 100);
    const mo = targetYm % 100;
    const desc = formatMonth(y, mo);
    const have = all.some(l => parseYm(l.description) === targetYm && Math.round(l.amount) === mode);
    if (!have) toAdd.push({ desc, amount: mode });
  }
  // last was May → also June
  if (lastYm === 202605) {
    const desc = formatMonth(2026, 6);
    const have = all.some(l => parseYm(l.description) === 202606 && Math.round(l.amount) === mode);
    if (!have) toAdd.unshift({ desc, amount: mode });
  }
  if (!toAdd.length) continue;

  const open = all.reduce((s, l) => s + Math.round(l.amount) - Math.round(l.paid_amount || 0), 0);
  const bal = Math.round(Number(e.balance));
  if (bal !== open) continue; // only silent-match type

  plans.push({
    id: e.id,
    code: e.external_code,
    name: e.company_name,
    bal,
    open,
    lastDesc,
    toAdd,
    addSum: toAdd.reduce((s, x) => s + x.amount, 0),
  });
}

console.log(`plans ${plans.length} apply=${APPLY}`);
for (const p of plans) {
  console.log(
    `${p.code}\t${p.name}\t+${p.addSum}\t${p.toAdd.map(x => x.desc).join(',')}`,
  );
}

if (!APPLY) {
  await sql.end({ timeout: 5 });
  process.exit(0);
}

let fixed = 0;
for (const p of plans) {
  const all = byEntry.get(p.id) || [];
  let sort = all.length ? Math.max(...all.map(l => l.sort_order)) + 1 : 0;
  for (const row of p.toAdd) {
    await sql`
      INSERT INTO arrears_letter_lines (
        arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
      ) VALUES (
        ${p.id}, ${sort}, ${row.desc}, ${row.amount}, 0, '', 'letter'
      )
    `;
    sort += 1;
  }
  const newOpen = p.open + p.addSum;
  await sql`
    UPDATE arrears_entries SET
      balance = ${newOpen},
      updated_by = 'fix-2026-tail-months',
      updated_at = now()
    WHERE id = ${p.id}
  `;
  fixed += 1;
}
console.log('fixed', fixed);
await sql.end({ timeout: 5 });
