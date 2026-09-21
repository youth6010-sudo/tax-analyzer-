/**
 * 전체 정리: 기장미수 업체의 7·8월 누락 재검증 + 공문합 vs 현황 통계
 * — 입금이 기장줄 paidAmount로 이미 반영된 경우 오탐 제외
 *
 * node --import tsx scripts/finalize-arrears-jul-aug-audit.mjs
 * node --import tsx scripts/finalize-arrears-jul-aug-audit.mjs --apply
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
const STATUS20 = 'C:/Users/ADMIN/Downloads/미수수수료 거래처(잔액)현황_26.09.20.xlsx';

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
const { isArrearsLetterProtected, isArrearsForceMismatch } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsBalanceLock.ts')).href
);
const { isIndieManagerName } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportFilenames.ts')).href
);
const { applyStatusImport } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportApply.ts')).href
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

/** 입금이 별도줄 또는 기장줄 paidAmount로 이미 있는지 */
function letterHasPay(lines, tx) {
  const amt = Math.round(tx.credit || 0);
  if (amt <= 0) return true;
  // 1) 동일 일자·금액 지급
  for (const l of lines) {
    if (Math.round(l.paidAmount || 0) !== amt) continue;
    if (paidDateKoMatches(l.paidDate, tx.eventDate)) return true;
  }
  // 2) 같은 달 기장줄에 이미 전액 지급된 경우 (즉시회수 형태가 공문에 합쳐진 경우)
  const m = ym(tx.eventDate);
  const sameMonthFees = lines.filter(
    l => isMonthFeeDesc(l.description) && lineYm(l.description) === m,
  );
  if (sameMonthFees.some(l => Math.round(l.paidAmount || 0) >= amt)) return true;
  // 3) 직전 달 기장에 이 날짜로 지급 기록
  const [y, mo] = m.split('-').map(Number);
  const prevMo = mo === 1 ? 12 : mo - 1;
  const prevY = mo === 1 ? y - 1 : y;
  const prev = `${prevY}-${String(prevMo).padStart(2, '0')}`;
  for (const l of lines) {
    if (!isMonthFeeDesc(l.description)) continue;
    if (lineYm(l.description) !== prev && lineYm(l.description) !== m) continue;
    if (Math.round(l.paidAmount || 0) !== amt) continue;
    if (paidDateKoMatches(l.paidDate, tx.eventDate)) return true;
  }
  return false;
}

function letterHasFee(lines, tx) {
  const amt = Math.round(tx.debit || 0);
  const m = ym(tx.eventDate);
  if (amt <= 0 || !m) return true;
  return lines.some(
    l =>
      isMonthFeeDesc(l.description) &&
      lineYm(l.description) === m &&
      Math.round(l.amount) === amt,
  );
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
const sepBal = new Map(
  parseArrearsStatusWorkbook(fs.readFileSync(STATUS20)).rows.map(r => [
    String(r.externalCode).padStart(5, '0'),
    Math.round(r.balance),
  ]),
);

const db = getDb();
const entries = await db.select().from(arrearsEntries);

const stats = {
  total: entries.length,
  matchDb: 0,
  mismatchDb: 0,
  matchAug: 0,
  matchSep: 0,
  unpaidBk: 0,
  julAugOk: 0,
  needFixSafe: [],
  needFixUnsafe: [],
  falsePositiveCleared: 0,
  forceMismatch: 0,
  protected: 0,
  indie: 0,
  originalMismatch: [],
};

const fixed = [];

for (const e of entries) {
  const code = String(e.externalCode || '').padStart(5, '0');
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const dbBal = Math.round(e.balance);
  const a = augBal.has(code) ? augBal.get(code) : null;
  const s = sepBal.has(code) ? sepBal.get(code) : null;

  if (open === dbBal) stats.matchDb += 1;
  else stats.mismatchDb += 1;
  if (a != null && open === a) stats.matchAug += 1;
  if (s != null && open === s) stats.matchSep += 1;

  if (isArrearsForceMismatch(code)) stats.forceMismatch += 1;
  if (isArrearsLetterProtected(code)) {
    stats.protected += 1;
    continue;
  }
  if (isIndieManagerName(e.managerName)) {
    stats.indie += 1;
    continue;
  }

  if (!hasUnpaidMonthBookkeepingOnLetter(lines)) continue;
  stats.unpaidBk += 1;

  const excelTxs = (txsByCode.get(code) || [])
    .filter(t => {
      const m = ym(t.eventDate);
      return m === '2026-07' || m === '2026-08';
    })
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));

  const toAddTxs = [];
  for (const tx of excelTxs) {
    const debit = Math.round(tx.debit || 0);
    const credit = Math.round(tx.credit || 0);
    if (debit > 0 && /\d{1,2}\s*월|기장/.test(String(tx.ledgerDescription || ''))) {
      if (!letterHasFee(lines, tx)) toAddTxs.push(tx);
    } else if (credit > 0) {
      if (!letterHasPay(lines, tx)) toAddTxs.push(tx);
    }
  }

  if (!toAddTxs.length) {
    stats.julAugOk += 1;
    if (a != null && open !== a && !isArrearsForceMismatch(code)) {
      stats.originalMismatch.push({
        code,
        name: e.companyName,
        open,
        augBal: a,
        dbBal,
        note: 'jul/aug ok but open≠aug31',
      });
    }
    continue;
  }

  // 예전 오탐: 입금만 추가하려 하는데 open이 이미 aug와 같음 → 정리됨으로 간주
  const onlyPays = toAddTxs.every(t => Math.round(t.credit || 0) > 0);
  if (onlyPays && a != null && open === a) {
    stats.falsePositiveCleared += 1;
    stats.julAugOk += 1;
    continue;
  }
  if (onlyPays && open === dbBal) {
    stats.falsePositiveCleared += 1;
    stats.julAugOk += 1;
    continue;
  }

  const letterDescs = lines.map(l => l.description);
  const additions = [];
  for (const tx of toAddTxs) {
    const line = clientDetailTxToLineInput(tx, letterDescs);
    if (!line) continue;
    // 빈 적요 입금은 description 비움 (「입금」문구 방지)
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
  const safe = after === a || after === dbBal || after === open;
  const row = {
    code,
    name: e.companyName,
    open,
    after,
    augBal: a,
    dbBal,
    addCount: additions.length,
    added: additions.map(l => ({
      d: l.description || '(입금)',
      a: l.amount,
      p: l.paidAmount,
      pd: l.paidDate,
    })),
  };

  if (safe) {
    stats.needFixSafe.push(row);
    if (APPLY && additions.length) {
      await replaceLetterLines(e.id, 'finalize-jul-aug', next, { syncBalance: false });
      fixed.push(row);
    }
  } else {
    stats.needFixUnsafe.push(row);
    if (a != null && open !== a) {
      stats.originalMismatch.push({
        code,
        name: e.companyName,
        open,
        augBal: a,
        dbBal,
        note: 'jul/aug gap but unsafe to auto-add',
        wouldAdd: row.added,
      });
    }
  }
}

// 9/20 현황 잔액만 재동기화 (공문 건드리지 않음)
let statusResult = null;
if (APPLY) {
  statusResult = await applyStatusImport(fs.readFileSync(STATUS20), 'finalize-sep20-status');
}

const out = {
  apply: APPLY,
  fixed: fixed.length,
  statusResult,
  stats: {
    total: stats.total,
    matchDb: stats.matchDb,
    mismatchDb: stats.mismatchDb,
    matchAug: stats.matchAug,
    matchSep: stats.matchSep,
    unpaidBk: stats.unpaidBk,
    julAugOk: stats.julAugOk,
    falsePositiveCleared: stats.falsePositiveCleared,
    safeFix: stats.needFixSafe.length,
    unsafeLeft: stats.needFixUnsafe.length,
    forceMismatch: stats.forceMismatch,
    protected: stats.protected,
    indie: stats.indie,
    originalMismatchCount: stats.originalMismatch.length,
  },
  safeFix: stats.needFixSafe,
  unsafeLeft: stats.needFixUnsafe,
  originalMismatch: stats.originalMismatch.slice(0, 80),
  fixedRows: fixed,
};

fs.writeFileSync(
  path.join(root, 'data/_finalize-arrears-report.json'),
  JSON.stringify(out, null, 2),
  'utf8',
);

console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY', ...out.stats, fixed: fixed.length }, null, 2));
for (const r of stats.needFixSafe.slice(0, 15)) {
  console.log('SAFE', r.code, r.name, r.open, '→', r.after);
}
for (const r of stats.needFixUnsafe.slice(0, 10)) {
  console.log('UNSAFE', r.code, r.name, r.open, '→', r.after, 'aug', r.augBal);
}
console.log('wrote data/_finalize-arrears-report.json');
