/**
 * open이 이미 08.31 현황과 같은 업체: 7·8월 기장+입금 쌍만 (넷 0) 보강
 * — 잔액 안 건드리고 내역만 채움 (도리·아이스테형 잔여)
 *
 * node --import tsx scripts/fill-balanced-jul-aug-pairs.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const DETAIL31 = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260831.xlsx';
const STATUS31 = 'C:/Users/ADMIN/Downloads/미수수수료 거래처(잔액)현황_26.08.31.xlsx';

const { parseArrearsClientDetailWorkbook, clientDetailTxToLineInput } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsClientDetailParse.ts')).href
);
const { parseArrearsStatusWorkbook } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsStatusParse.ts')).href
);
const { getDb } = await import(pathToFileURL(path.join(root, 'db/index.ts')).href);
const { arrearsEntries } = await import(pathToFileURL(path.join(root, 'db/schema.ts')).href);
const { listLetterLines, replaceLetterLines } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsLetterDb.ts')).href
);
const { letterBalanceFromLines } = await import(
  pathToFileURL(path.join(root, 'app/types/arrears.ts')).href
);
const { hasUnpaidMonthBookkeepingOnLetter } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportApply.ts')).href
);
const { isArrearsLetterProtected } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsBalanceLock.ts')).href
);
const { isIndieManagerName } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportFilenames.ts')).href
);

function ym(iso) {
  return String(iso || '').slice(0, 7);
}
function lineYm(desc) {
  const d = String(desc || '').replace(/\s+/g, '');
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료|기장료|기장수수료)?(\d{1,2})월/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[2])).padStart(2, '0')}`;
}
function isMonthFeeDesc(desc) {
  const d = String(desc || '').replace(/\s+/g, '');
  if (/조정|성실|고문|부가세|양수도|전기이월/.test(d)) return false;
  return lineYm(desc) != null;
}
function paidDateKoMatches(paidDate, eventDate) {
  const pd = String(paidDate || '').replace(/\s+/g, '');
  const iso = String(eventDate || '');
  if (!pd || !iso) return false;
  const mo = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const m = pd.match(/^(\d{1,2})월(\d{1,2})일$/);
  return Boolean(m && Number(m[1]) === mo && Number(m[2]) === day);
}
function letterHasFee(lines, month, amt) {
  return lines.some(
    l =>
      isMonthFeeDesc(l.description) &&
      lineYm(l.description) === month &&
      Math.round(l.amount) === amt,
  );
}
function letterHasPay(lines, tx) {
  const amt = Math.round(tx.credit || 0);
  if (amt <= 0) return true;
  for (const l of lines) {
    if (Math.round(l.paidAmount || 0) !== amt) continue;
    if (paidDateKoMatches(l.paidDate, tx.eventDate)) return true;
  }
  const m = ym(tx.eventDate);
  if (
    lines.some(
      l =>
        isMonthFeeDesc(l.description) &&
        lineYm(l.description) === m &&
        Math.round(l.paidAmount || 0) >= amt,
    )
  ) {
    return true;
  }
  return false;
}

const allTxs = parseArrearsClientDetailWorkbook(fs.readFileSync(DETAIL31));
const txsByCode = new Map();
for (const tx of allTxs) {
  const code = String(tx.externalCode || '').padStart(5, '0');
  if (!txsByCode.has(code)) txsByCode.set(code, []);
  txsByCode.get(code).push(tx);
}
const augBal = new Map(
  parseArrearsStatusWorkbook(fs.readFileSync(STATUS31)).rows.map(r => [
    String(r.externalCode).padStart(5, '0'),
    Math.round(r.balance),
  ]),
);

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const report = [];
const fixed = [];

for (const e of entries) {
  const code = String(e.externalCode || '').padStart(5, '0');
  if (isArrearsLetterProtected(code)) continue;
  if (isIndieManagerName(e.managerName)) continue;
  if (!augBal.has(code)) continue;

  const lines = await listLetterLines(e.id);
  if (!hasUnpaidMonthBookkeepingOnLetter(lines)) continue;
  const open = letterBalanceFromLines(lines);
  const target = augBal.get(code);
  // 잔액이 이미 맞거나, DB잔액이 목표와 같고 공문도 같은 경우만 (잔액 유지 보강)
  if (open !== target && open !== Math.round(e.balance)) continue;
  if (open !== target && Math.round(e.balance) === target) {
    // open≠aug but db=aug — skip pair fill (would need balance repair first)
    continue;
  }
  if (open !== target) continue;

  const excel = (txsByCode.get(code) || []).filter(t => {
    const m = ym(t.eventDate);
    return m === '2026-07' || m === '2026-08';
  });

  // 월별: 기장 합 / 입금 합
  const byMonth = {
    '2026-07': { fees: [], pays: [] },
    '2026-08': { fees: [], pays: [] },
  };
  for (const tx of excel) {
    const m = ym(tx.eventDate);
    if (!byMonth[m]) continue;
    if (Math.round(tx.debit || 0) > 0 && /\d{1,2}\s*월|기장/.test(String(tx.ledgerDescription || ''))) {
      byMonth[m].fees.push(tx);
    } else if (Math.round(tx.credit || 0) > 0) {
      byMonth[m].pays.push(tx);
    }
  }

  const toAdd = [];
  for (const month of ['2026-07', '2026-08']) {
    const { fees, pays } = byMonth[month];
    const missingFees = fees.filter(tx => !letterHasFee(lines, month, Math.round(tx.debit)));
    const missingPays = pays.filter(tx => !letterHasPay(lines, tx));
    if (!missingFees.length && !missingPays.length) continue;

    // 이 달에 넣을 것들의 넷이 0이어야 함 (잔액 유지)
    const addFeeAmt = missingFees.reduce((s, t) => s + Math.round(t.debit), 0);
    const addPayAmt = missingPays.reduce((s, t) => s + Math.round(t.credit), 0);
    if (addFeeAmt !== addPayAmt) continue; // 넷 0 아니면 스킵
    if (addFeeAmt === 0 && addPayAmt === 0) continue;

    // 시간순: 입금 먼저 나오는 엑셀 순서 유지
    const monthTxs = [...missingPays, ...missingFees].sort((a, b) =>
      String(a.eventDate).localeCompare(String(b.eventDate)),
    );
    toAdd.push(...monthTxs);
  }

  if (!toAdd.length) continue;

  const letterDescs = lines.map(l => l.description);
  const additions = [];
  for (const tx of toAdd) {
    const line = clientDetailTxToLineInput(tx, letterDescs);
    if (!line) continue;
    if (!String(tx.ledgerDescription || '').trim() && Math.round(tx.credit || 0) > 0) {
      line.description = '';
    }
    additions.push({ ...line, source: 'ledger' });
    letterDescs.push(line.description);
  }

  const next = [
    ...lines.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source || 'letter',
    })),
    ...additions,
  ];
  const after = letterBalanceFromLines(next);
  if (after !== open) continue; // 안전장치

  const row = {
    code,
    name: e.companyName,
    addCount: additions.length,
    added: additions.map(l => ({
      d: l.description || '(입금)',
      a: l.amount,
      p: l.paidAmount,
      pd: l.paidDate,
    })),
    open,
    after,
  };
  report.push(row);

  if (APPLY) {
    await replaceLetterLines(e.id, 'fill-balanced-jul-aug', next, { syncBalance: false });
    fixed.push(row);
  }
}

console.log(APPLY ? 'APPLY' : 'DRY', 'pair-fill', report.length, 'fixed', fixed.length);
for (const r of report) {
  console.log(r.code, r.name, '+', r.addCount, r.added.map(a => `${a.d}:${a.a}/${a.p}`).join('; '));
}
fs.writeFileSync(
  path.join(root, 'data/_fill-balanced-jul-aug.json'),
  JSON.stringify({ apply: APPLY, report }, null, 2),
  'utf8',
);
