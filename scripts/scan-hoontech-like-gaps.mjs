/**
 * 기장료 미수가 한 달이라도 있던 업체만 — cutoff 이후 빠진 월기장/회수
 * node --import tsx scripts/scan-hoontech-like-gaps.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const { getDb } = await import('../db/index.ts');
const { arrearsEntries } = await import('../db/schema.ts');
const { listLetterLines } = await import('../lib/arrearsLetterDb.ts');
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');
const {
  parseArrearsClientDetailWorkbook,
  clientDetailTxToLineInput,
} = await import('../lib/arrearsClientDetailParse.ts');
const {
  readArrearsImportConfig,
  isAfterCutoff,
  toIsoDate,
} = await import('../lib/arrearsImportConfig.ts');
const { skipImmediateMonthlyRecoveryTxs } = await import(
  '../lib/arrearsImportApply.ts'
);
const { isInactiveArrearsCode } = await import('../lib/arrearsInactiveSeed.ts');

const detailPath =
  process.argv[2] ||
  'C:/Users/ADMIN/Downloads/거래처별 현황_20260831.xlsx';
const cfg = readArrearsImportConfig();
const cutoff = cfg.letterCutoffDate;

const buf = fs.readFileSync(detailPath);
const allTxs = parseArrearsClientDetailWorkbook(buf).filter(t =>
  isAfterCutoff(t.eventDate, cutoff),
);
const byCode = new Map();
for (const t of allTxs) {
  const code = String(t.externalCode || '').trim();
  if (!code) continue;
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(t);
}

function compact(s) {
  return String(s || '').replace(/\s+/g, '');
}

/** 월 기장료 청구 줄인지 (조정·성실·부가세·전기이월 제외) */
function isMonthBookkeepingCharge(desc, amount) {
  if (Math.round(amount || 0) <= 0) return false;
  const d = compact(desc);
  if (!d) return false;
  if (/전기이월|원장반영|입금|취소|반환/.test(d)) return false;
  if (/조정|성실|부가세|양수도|선수금/.test(d)) return false;
  if (/기타/.test(d)) return false;
  // 2026년 7월 / 26년7월 / 7월 기장수수료
  if (/(20\d{2}|\d{2})년(?:기타수수료)?\d{1,2}월/.test(d)) return true;
  if (/^\d{1,2}월/.test(d) && /기장|수수료/.test(d)) return true;
  if (/^\d{1,2}월$/.test(d)) return true;
  return false;
}

function unpaidMonthBookkeeping(lines) {
  return lines.filter(
    l =>
      isMonthBookkeepingCharge(l.description, l.amount) &&
      Math.round(l.amount) - Math.round(l.paidAmount || 0) > 0,
  );
}

function ymFromDesc(desc) {
  const d = compact(desc);
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[2])).padStart(2, '0')}`;
}

function monthCovered(lines, yearMonth, amount) {
  return lines.some(l => {
    const ym = ymFromDesc(l.description);
    if (ym !== yearMonth) return false;
    if (amount == null) return Math.round(l.amount) > 0;
    return Math.round(l.amount) === amount;
  });
}

function paymentCovered(lines, paidAmount, paidDateKo) {
  const amt = Math.round(paidAmount);
  const dateKey = compact(paidDateKo);
  return lines.some(l => {
    if (Math.round(l.paidAmount || 0) !== amt) return false;
    if (!dateKey) return true;
    return compact(l.paidDate) === dateKey;
  });
}

/**
 * cutoff 시점(또는 그 직전)에 기장료 미수가 있었는지.
 * = letter 줄만으로, cutoff 월 이전·당월 기장 청구 중 미납이 하나라도 있음
 *   또는 전체 letter 이력에 기장 미납이 있고 그 잔액이 해소되지 않은 채 cutoff 이후 거래가 생김
 *
 * 사용자 기준: 「기장료 미수가 한 달이라도 있던 곳」
 * → 공문 letter 내역에 미납 기장료 줄이 한 줄이라도 있으면 true
 */
function hadUnpaidBookkeepingMonth(lines) {
  return unpaidMonthBookkeeping(lines.filter(l => l.source === 'letter')).length > 0;
}

const db = getDb();
const entries = await db.select().from(arrearsEntries);

const hits = [];
const excludedNoBookkeepingArrears = [];

for (const e of entries) {
  const code = e.externalCode;
  if (isInactiveArrearsCode(code)) continue;
  const codeTxs = byCode.get(code);
  if (!codeTxs?.length) continue;

  const lines = await listLetterLines(e.id);
  if (!lines.length) continue;

  const letterLines = lines.filter(l => l.source === 'letter');
  const unpaidBk = unpaidMonthBookkeeping(letterLines);
  if (!unpaidBk.length) {
    // letter에 기장 미납 없는데 skip으로 빠진 건 — 참고용
    continue;
  }

  const kept = skipImmediateMonthlyRecoveryTxs(codeTxs);
  const keptSet = new Set(kept);
  const dropped = codeTxs.filter(t => !keptSet.has(t));
  if (!dropped.length) continue;

  const letterDescs = lines.map(l => l.description);
  const gaps = [];

  for (const tx of dropped) {
    const line = clientDetailTxToLineInput(tx, letterDescs);
    if (!line) continue;
    if (/부가세/.test(line.description)) continue;

    if (line.amount > 0) {
      const ym = ymFromDesc(line.description) || toIsoDate(tx.eventDate).slice(0, 7);
      if (monthCovered(lines, ym, Math.round(line.amount))) continue;
      gaps.push({
        kind: 'charge',
        eventDate: tx.eventDate,
        desc: line.description,
        amount: line.amount,
        paidAmount: line.paidAmount,
        paidDate: line.paidDate,
      });
    } else if (line.paidAmount > 0) {
      if (paymentCovered(lines, line.paidAmount, line.paidDate)) continue;
      const paired = dropped.find(
        t => t !== tx && Math.round(t.debit) === Math.round(line.paidAmount) && t.debit > 0,
      );
      if (paired) {
        const cLine = clientDetailTxToLineInput(paired, letterDescs);
        const ym =
          (cLine && ymFromDesc(cLine.description)) ||
          toIsoDate(paired.eventDate).slice(0, 7);
        const coveredPaid = lines.some(
          l =>
            ymFromDesc(l.description) === ym &&
            Math.round(l.amount) === Math.round(line.paidAmount) &&
            Math.round(l.paidAmount || 0) === Math.round(line.paidAmount),
        );
        if (coveredPaid) continue;
      }
      gaps.push({
        kind: 'payment',
        eventDate: tx.eventDate,
        desc: line.description,
        amount: line.amount,
        paidAmount: line.paidAmount,
        paidDate: line.paidDate,
      });
    }
  }

  if (!gaps.length) continue;

  const sampleUnpaid = unpaidBk.slice(0, 5).map(l => ({
    desc: l.description,
    amount: l.amount,
    paid: l.paidAmount,
    open: Math.round(l.amount) - Math.round(l.paidAmount || 0),
  }));

  hits.push({
    code,
    name: e.companyName,
    bal: Math.round(e.balance),
    letterOpen: letterBalanceFromLines(letterLines),
    unpaidBookkeepingCount: unpaidBk.length,
    unpaidBookkeepingSum: unpaidBk.reduce(
      (s, l) => s + Math.round(l.amount) - Math.round(l.paidAmount || 0),
      0,
    ),
    sampleUnpaid,
    gaps,
  });
}

hits.sort((a, b) => a.code.localeCompare(b.code));

console.log('cutoff', cutoff);
console.log(
  '\n=== 기장료 미납(letter) 한 달↑ + 빠진 cutoff 이후 월기장/회수 ===',
  hits.length,
);
for (const h of hits) {
  console.log(
    `\n${h.code} ${h.name} | 현황 ${h.bal.toLocaleString()} | 기장미납 ${h.unpaidBookkeepingCount}개월 / ${h.unpaidBookkeepingSum.toLocaleString()}원`,
  );
  console.log(
    '  미납기장 예:',
    h.sampleUnpaid.map(s => `${s.desc}(+${s.open})`).join(', '),
  );
  for (const g of h.gaps) {
    console.log(
      `  [${g.kind}] ${g.eventDate} ${g.desc} amt=${g.amount} paid=${g.paidAmount} ${g.paidDate || ''}`,
    );
  }
}

const out = path.join(root, 'data', 'scan-hoontech-like-gaps.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ cutoff, hits }, null, 2), 'utf8');
console.log('\nwrote', out);
process.exit(0);
