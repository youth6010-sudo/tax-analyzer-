/**
 * 기장료 미납 업체: cutoff 이후 월기장회수로 빠진 매출·회수 복구
 * node --import tsx scripts/fix-unpaid-bk-monthly-gaps.mjs
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
const { eq } = await import('drizzle-orm');
const { listLetterLines, replaceLetterLines } = await import(
  '../lib/arrearsLetterDb.ts'
);
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');
const {
  parseArrearsClientDetailWorkbook,
  clientDetailTxToLineInput,
  lineDedupKey,
} = await import('../lib/arrearsClientDetailParse.ts');
const {
  readArrearsImportConfig,
  isAfterCutoff,
  toIsoDate,
} = await import('../lib/arrearsImportConfig.ts');
const {
  skipImmediateMonthlyRecoveryTxs,
  hasUnpaidMonthBookkeepingOnLetter,
} = await import('../lib/arrearsImportApply.ts');

const CODES = new Set(['00242', '00659', '00942', '01070', '01205', '01213']);
const detailPath =
  process.argv[2] ||
  'C:/Users/ADMIN/Downloads/거래처별 현황_20260831.xlsx';
const actor = 'fix-unpaid-bk-monthly-gaps';

const cfg = readArrearsImportConfig();
const cutoff = cfg.letterCutoffDate;
const buf = fs.readFileSync(detailPath);
const allTxs = parseArrearsClientDetailWorkbook(buf).filter(t =>
  isAfterCutoff(t.eventDate, cutoff),
);
const byCode = new Map();
for (const t of allTxs) {
  const code = String(t.externalCode || '').trim();
  if (!CODES.has(code)) continue;
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(t);
}

function compact(s) {
  return String(s || '').replace(/\s+/g, '');
}

function ymFromDesc(desc) {
  const d = compact(desc);
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[2])).padStart(2, '0')}`;
}

function normalizeYmDesc(desc, eventDate) {
  const raw = String(desc || '').trim();
  const ym = ymFromDesc(raw) || toIsoDate(eventDate).slice(0, 7);
  const [y, mo] = ym.split('-');
  // 공문 스타일: 2026년 7월
  if (/입금|^$/.test(compact(raw)) || !ymFromDesc(raw)) {
    if (Math.round(Number(arguments[2] || 0)) > 0) {
      /* charge */
    }
  }
  return { y: Number(y), mo: Number(mo), ym };
}

function monthChargeCovered(lines, ym, amount) {
  return lines.some(
    l =>
      ymFromDesc(l.description) === ym &&
      Math.round(l.amount) === amount,
  );
}

/** 해당 월 청구 줄에 동일 금액·일자 지급이 붙어 있는지 */
function monthFullyPaid(lines, ym, amount, paidDate) {
  const dateKey = compact(paidDate);
  return lines.some(l => {
    if (ymFromDesc(l.description) !== ym) return false;
    if (Math.round(l.amount) !== amount) return false;
    if (Math.round(l.paidAmount || 0) !== amount) return false;
    if (!dateKey) return true;
    return compact(l.paidDate) === dateKey;
  });
}

function paymentOnMonthOrSeparate(lines, ym, amount, paidDate) {
  if (monthFullyPaid(lines, ym, amount, paidDate)) return true;
  // 별도 입금 줄 (amount=0)
  const dateKey = compact(paidDate);
  return lines.some(l => {
    if (Math.round(l.amount) !== 0) return false;
    if (Math.round(l.paidAmount || 0) !== amount) return false;
    return !dateKey || compact(l.paidDate) === dateKey;
  });
}

const db = getDb();
const results = [];

for (const code of [...CODES].sort()) {
  const [entry] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, code))
    .limit(1);
  if (!entry) {
    results.push({ code, ok: false, error: 'entry missing' });
    continue;
  }

  const existing = await listLetterLines(entry.id);
  const letterLines = existing.filter(l => l.source === 'letter');
  if (!hasUnpaidMonthBookkeepingOnLetter(letterLines)) {
    results.push({
      code,
      name: entry.companyName,
      ok: false,
      error: 'no unpaid bookkeeping on letter',
    });
    continue;
  }

  const codeTxs = byCode.get(code) || [];
  const kept = skipImmediateMonthlyRecoveryTxs(codeTxs);
  const keptSet = new Set(kept);
  const dropped = codeTxs.filter(t => !keptSet.has(t));

  const letterDescs = existing.map(l => l.description);
  const next = existing.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source,
  }));

  // dropped를 시간순으로: 청구와 입금을 월 단위로 묶어 한 줄로 합치기
  const charges = [];
  const payments = [];
  for (const tx of dropped) {
    const line = clientDetailTxToLineInput(tx, letterDescs);
    if (!line || /부가세/.test(line.description)) continue;
    if (line.amount > 0) {
      const ym =
        ymFromDesc(line.description) || toIsoDate(tx.eventDate).slice(0, 7);
      charges.push({ tx, line, ym, amount: Math.round(line.amount) });
    } else if (line.paidAmount > 0) {
      payments.push({
        tx,
        line,
        amount: Math.round(line.paidAmount),
        paidDate: line.paidDate || '',
      });
    }
  }

  const usedPay = new Set();
  const additions = [];

  for (const c of charges) {
    if (monthChargeCovered(next, c.ym, c.amount)) continue;

    // 짝 입금: 동일 금액, 아직 미사용
    let pay = null;
    for (let i = 0; i < payments.length; i++) {
      if (usedPay.has(i)) continue;
      if (payments[i].amount !== c.amount) continue;
      pay = payments[i];
      usedPay.add(i);
      break;
    }

    const [y, mo] = c.ym.split('-').map(Number);
    const desc = `${y}년 ${mo}월`;

    if (pay && !monthFullyPaid(next, c.ym, c.amount, pay.paidDate)) {
      additions.push({
        description: desc,
        amount: c.amount,
        paidAmount: c.amount,
        paidDate: pay.paidDate,
        source: 'ledger',
      });
    } else if (!pay) {
      additions.push({
        description: desc,
        amount: c.amount,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      });
    }
  }

  // 청구와 짝 못 지은 입금 (드묾)
  for (let i = 0; i < payments.length; i++) {
    if (usedPay.has(i)) continue;
    const p = payments[i];
    // 아무 월에든 같은 금액+일자가 이미 있으면 스킵
    const already = next.some(
      l =>
        Math.round(l.paidAmount || 0) === p.amount &&
        compact(l.paidDate) === compact(p.paidDate) &&
        (Math.round(l.amount) === p.amount || Math.round(l.amount) === 0),
    );
    if (already) continue;
    additions.push({
      description: p.line.description || '입금',
      amount: 0,
      paidAmount: p.amount,
      paidDate: p.paidDate,
      source: 'payment',
    });
  }

  if (!additions.length) {
    results.push({
      code,
      name: entry.companyName,
      ok: true,
      skipped: true,
      reason: 'nothing to add',
    });
    continue;
  }

  // 8월 미납 줄이 있으면 그 앞에, 없으면 맨 뒤
  const augIdx = next.findIndex(l => {
    const ym = ymFromDesc(l.description);
    return ym && ym.endsWith('-08') && Math.round(l.amount) > 0;
  });
  // 청구 월 순서대로 삽입
  additions.sort((a, b) => {
    const ya = ymFromDesc(a.description) || '';
    const yb = ymFromDesc(b.description) || '';
    return ya.localeCompare(yb);
  });

  let insertAt = augIdx >= 0 ? augIdx : next.length;
  for (const a of additions) {
    // 이미 같은 키가 있으면 스킵
    const key = lineDedupKey(a);
    if (next.some(l => lineDedupKey(l) === key)) continue;
    next.splice(insertAt, 0, a);
    insertAt += 1;
  }

  const openBefore = letterBalanceFromLines(existing);
  const openAfter = letterBalanceFromLines(next);
  const bal = Math.round(entry.balance);

  // 순증감 0이어야 정상 (청구+회수 쌍). 청구만이면 잔액 증가 — 허용하되 경고
  if (openAfter !== bal && openAfter !== openBefore) {
    // 청구만 추가된 경우(33카페) 잔액이 늘 수 있음 — 현황과 다르면 주의
    console.warn(
      `WARN ${code} open ${openBefore} → ${openAfter} bal ${bal}`,
    );
  }

  await replaceLetterLines(entry.id, actor, next, { syncBalance: false });
  const saved = await listLetterLines(entry.id);
  results.push({
    code,
    name: entry.companyName,
    ok: true,
    added: additions,
    openBefore,
    openAfter: letterBalanceFromLines(saved),
    bal,
    tail: saved.slice(-4).map(
      l => `${l.description}|${l.amount}|${l.paidAmount}|${l.paidDate || ''}`,
    ),
  });
}

for (const r of results) {
  console.log(JSON.stringify(r, null, 2));
}
console.log('\ndone', results.filter(r => r.ok && !r.skipped).length, 'updated');
process.exit(results.some(r => r.ok === false) ? 1 : 0);
