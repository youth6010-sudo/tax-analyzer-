/**
 * 미수 전수 감사: 잔액≠내역, 월별 공백, 총합 불일치
 * node scripts/audit-arrears-totals.mjs
 */
import { readFileSync } from 'fs';
import postgres from 'postgres';

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const LOCKED = new Set(['00183', '00199']);

const entries = await sql`
  SELECT id, external_code, company_name, balance, carry_in, debit, credit,
         manager_name, as_of_date, letter_date
  FROM arrears_entries
  ORDER BY balance DESC
`;

const lineSums = await sql`
  SELECT arrears_entry_id,
         coalesce(sum(amount - paid_amount), 0)::bigint AS open,
         bool_or(source = 'letter') AS has_letter,
         count(*)::int AS cnt
  FROM arrears_letter_lines
  GROUP BY arrears_entry_id
`;

const openBy = new Map(lineSums.map(r => [r.arrears_entry_id, Number(r.open)]));
const hasLetterBy = new Map(lineSums.map(r => [r.arrears_entry_id, r.has_letter]));

const allLines = await sql`
  SELECT arrears_entry_id, sort_order, description, amount, paid_amount, source
  FROM arrears_letter_lines
  ORDER BY arrears_entry_id, sort_order
`;
const linesBy = new Map();
for (const l of allLines) {
  const arr = linesBy.get(l.arrears_entry_id) || [];
  arr.push(l);
  linesBy.set(l.arrears_entry_id, arr);
}

const MONTH_RE = /(20\d{2}|\d{2})년\s*(?:기타수수료\s*)?(\d{1,2})월/;
function parseMonth(desc) {
  const d = String(desc || '').replace(/\s+/g, '');
  const m = d.match(MONTH_RE);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return y * 100 + Number(m[2]);
}

function findMonthlyGaps(lines) {
  const letterLines = lines.filter(l => l.source === 'letter' && Math.round(l.amount) > 0);
  const months = [];
  for (let i = 0; i < letterLines.length; i++) {
    const prev = i > 0 ? letterLines[i - 1].description : '';
    let desc = letterLines[i].description;
    if (/^\d{1,2}월$/.test(String(desc).trim()) && prev) {
      const pm = prev.match(MONTH_RE);
      if (pm) {
        let y = Number(pm[1]);
        if (y < 100) y += 2000;
        desc = `${y}년 ${String(desc).trim()}`;
      }
    }
    const ym = parseMonth(desc);
    if (ym) months.push({ ym, amount: Math.round(letterLines[i].amount), desc: letterLines[i].description });
  }
  if (months.length < 2) return [];
  const gaps = [];
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1];
    const cur = months[i];
    const py = Math.floor(prev.ym / 100);
    const pm = prev.ym % 100;
    const cy = Math.floor(cur.ym / 100);
    const cm = cur.ym % 100;
    let ey = py;
    let em = pm + 1;
    if (em > 12) { em = 1; ey++; }
    while (ey * 100 + em < cur.ym) {
      gaps.push({
        year: ey,
        month: em,
        expectedAmount: prev.amount,
        after: prev.desc,
        before: cur.desc,
      });
      em++;
      if (em > 12) { em = 1; ey++; }
    }
  }
  return gaps;
}

const mismatches = [];
const silentGaps = []; // diff=0 but monthly sequence gap at end
const tailMissing = [];

const globalAsOf = entries.reduce((max, e) => {
  const d = e.as_of_date || '';
  return d > max ? d : max;
}, '');

// expect months through July 2026 if asOf is early August
const asOfYm = globalAsOf ? Number(globalAsOf.slice(0, 4)) * 100 + Number(globalAsOf.slice(5, 7)) : 202607;
const expectThroughYm = asOfYm; // e.g. 202608

let sumBalance = 0;
let sumOpen = 0;
let sumBalanceNonZero = 0;

for (const e of entries) {
  const bal = LOCKED.has(e.external_code) ? (e.external_code === '00183' ? 0 : 207301) : Math.round(Number(e.balance));
  const open = openBy.get(e.id) ?? 0;
  sumBalance += bal;
  sumOpen += open;
  if (bal !== 0) sumBalanceNonZero += bal;

  const diff = bal - open;
  const hasLetter = hasLetterBy.get(e.id) === true;
  const lines = linesBy.get(e.id) || [];

  if (diff !== 0 && !(open === 0 && bal === 0)) {
    if (!LOCKED.has(e.external_code) || Math.abs(diff) > 0) {
      mismatches.push({
        code: e.external_code,
        name: e.company_name,
        bal,
        open,
        diff,
        hasLetter,
        manager: e.manager_name,
      });
    }
  }

  if (!hasLetter) continue;
  const gaps = findMonthlyGaps(lines);
  if (gaps.length) {
    silentGaps.push({ code: e.external_code, name: e.company_name, bal, open, diff, gaps, manager: e.manager_name });
  }

  // tail: last monthly fee before asOf month
  const letterMonths = [];
  for (const l of lines.filter(x => x.source === 'letter' && Math.round(x.amount) > 0)) {
    const ym = parseMonth(l.description);
    if (ym && /월/.test(l.description)) letterMonths.push({ ym, amount: Math.round(l.amount), desc: l.description });
  }
  if (letterMonths.length) {
    letterMonths.sort((a, b) => a.ym - b.ym);
    const last = letterMonths[letterMonths.length - 1];
    const missingTail = [];
    let ey = Math.floor(last.ym / 100);
    let em = (last.ym % 100) + 1;
    while (ey * 100 + em <= expectThroughYm) {
      // only if same recurring amount pattern (>=3 same amounts at end)
      const recent = letterMonths.slice(-3).map(x => x.amount);
      const sameAmt = recent.length >= 2 && recent.every(a => a === recent[0]);
      if (sameAmt) {
        missingTail.push({ year: ey, month: em, amount: last.amount });
      }
      em++;
      if (em > 12) { em = 1; ey++; }
    }
    if (missingTail.length && bal > 0) {
      const tailSum = missingTail.reduce((s, t) => s + t.amount, 0);
      // only flag if balance suggests missing amount (diff >= tailSum or diff=0 with exact tail)
      if (diff === tailSum || (diff > 0 && diff <= tailSum + 1000) || (diff === 0 && tailSum > 0 && bal >= open + tailSum - 1000)) {
        tailMissing.push({
          code: e.external_code,
          name: e.company_name,
          bal,
          open,
          diff,
          lastMonth: last.desc,
          missingTail,
          manager: e.manager_name,
        });
      }
    }
  }
}

console.log('=== 총합 ===');
console.log('entries', entries.length);
console.log('sum(balance)', sumBalance.toLocaleString('ko-KR'));
console.log('sum(linesOpen)', sumOpen.toLocaleString('ko-KR'));
console.log('차이(balance-open)', (sumBalance - sumOpen).toLocaleString('ko-KR'));
console.log('nonzero balance sum', sumBalanceNonZero.toLocaleString('ko-KR'));
console.log('globalAsOf', globalAsOf, 'expectThroughYm', expectThroughYm);

console.log('\n=== mismatch (balance≠linesOpen)', mismatches.length);
for (const x of mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 30)) {
  console.log(`${x.code}\t${x.name}\tbal=${x.bal}\topen=${x.open}\tdiff=${x.diff}\t${x.manager}`);
}

console.log('\n=== sequence gaps in letter', silentGaps.length);
for (const x of silentGaps.slice(0, 40)) {
  console.log(`${x.code}\t${x.name}\tdiff=${x.diff}\tgaps=${x.gaps.map(g => `${g.year}년${g.month}월(${g.expectedAmount})`).join(',')}`);
}

console.log('\n=== tail missing months (heuristic)', tailMissing.length);
for (const x of tailMissing.slice(0, 50)) {
  console.log(`${x.code}\t${x.name}\tbal=${x.bal}\topen=${x.open}\tdiff=${x.diff}\tlast=${x.lastMonth}\tmissing=${x.missingTail.map(t => `${t.year}년${t.month}월`).join(',')}`);
}

await sql.end({ timeout: 5 });
