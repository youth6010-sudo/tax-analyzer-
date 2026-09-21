/**
 * 기장 미수 업체: 08.31 거래처별 엑셀의 2026-07·08 거래를 공문과 대조.
 * 빠진 기장·입금만 추가. 추가 후 공문합이 08.31 현황(또는 DB잔액)과 맞는 건만 적용.
 *
 * node --import tsx scripts/audit-fix-unpaid-bk-jul-aug.mjs
 * node --import tsx scripts/audit-fix-unpaid-bk-jul-aug.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const onlyCode = (process.argv.find(a => a.startsWith('--code=')) || '').slice(7);

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
const { eq } = await import('drizzle-orm');

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
  if (pd === `${mo}월${day}일` || pd === `${mo}월 ${day}일`) return true;
  // 「8월 14일」형태
  const m = pd.match(/^(\d{1,2})월(\d{1,2})일$/);
  if (m && Number(m[1]) === mo && Number(m[2]) === day) return true;
  return false;
}

/** 이 엑셀 입금이 공문에 이미 반영됐는지 */
function letterHasPay(lines, tx) {
  const amt = Math.round(tx.credit || 0);
  if (amt <= 0) return true;
  for (const l of lines) {
    const paid = Math.round(l.paidAmount || 0);
    if (paid !== amt) continue;
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

const statusBal = new Map(
  parseArrearsStatusWorkbook(fs.readFileSync(STATUS31)).rows.map(r => [
    String(r.externalCode).padStart(5, '0'),
    Math.round(r.balance),
  ]),
);

const db = getDb();
const entries = onlyCode
  ? await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, onlyCode))
  : await db.select().from(arrearsEntries);

const missing = [];
const safe = [];
const unsafe = [];
const ok = [];

for (const e of entries) {
  const code = String(e.externalCode || '').padStart(5, '0');
  if (isArrearsLetterProtected(code)) continue;
  if (isIndieManagerName(e.managerName)) continue;

  const lines = await listLetterLines(e.id);
  if (!hasUnpaidMonthBookkeepingOnLetter(lines)) continue;

  const excelTxs = (txsByCode.get(code) || [])
    .filter(t => {
      const m = ym(t.eventDate);
      return m === '2026-07' || m === '2026-08';
    })
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));

  if (!excelTxs.length) {
    ok.push(code);
    continue;
  }

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
    ok.push(code);
    continue;
  }

  const letterDescs = lines.map(l => l.description);
  const additions = [];
  for (const tx of toAddTxs) {
    const line = clientDetailTxToLineInput(tx, letterDescs);
    if (!line) continue;
    additions.push({ ...line, source: 'ledger' });
    letterDescs.push(line.description);
  }

  const before = letterBalanceFromLines(lines);
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
  const augBal = statusBal.has(code) ? statusBal.get(code) : null;
  const dbBal = Math.round(e.balance);
  const matchesTarget = after === augBal || after === dbBal;
  // 추가분만 넷 0이면(매출=입금) 잔액 유지 → 안전
  const netZeroAdd = after === before;

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
    before,
    after,
    augBal,
    dbBal,
    safe: matchesTarget || netZeroAdd,
  };
  missing.push(row);
  if (row.safe) safe.push(row);
  else unsafe.push(row);
}

const fixed = [];
if (APPLY) {
  for (const row of safe) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, row.code))
      .limit(1);
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const excelTxs = (txsByCode.get(row.code) || [])
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
    const letterDescs = lines.map(l => l.description);
    const additions = [];
    for (const tx of toAddTxs) {
      const line = clientDetailTxToLineInput(tx, letterDescs);
      if (!line) continue;
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
    await replaceLetterLines(e.id, 'fix-unpaid-bk-jul-aug', next, { syncBalance: false });
    fixed.push({ code: row.code, name: row.name, addCount: additions.length, after: row.after });
  }
}

const out = {
  apply: APPLY,
  ok: ok.length,
  missing: missing.length,
  safe: safe.length,
  unsafe: unsafe.length,
  fixed: fixed.length,
  safeRows: safe,
  unsafeRows: unsafe,
};
fs.writeFileSync(path.join(root, 'data/_audit-unpaid-bk-jul-aug.json'), JSON.stringify(out, null, 2), 'utf8');

console.log(
  JSON.stringify(
    {
      mode: APPLY ? 'APPLY' : 'DRY-RUN',
      ok: ok.length,
      missing: missing.length,
      safeWouldFix: safe.length,
      unsafeSkip: unsafe.length,
      fixed: fixed.length,
    },
    null,
    2,
  ),
);

for (const code of ['00180', '00156', '00191']) {
  const s = safe.find(r => r.code === code);
  const u = unsafe.find(r => r.code === code);
  const r = s || u;
  if (!r) console.log(code, 'OK (no missing jul/aug txs)');
  else
    console.log(
      code,
      r.name,
      r.safe ? 'SAFE' : 'UNSAFE',
      'add',
      r.addCount,
      'open',
      r.before,
      '→',
      r.after,
      'aug',
      r.augBal,
      r.added.map(a => `${a.d}:${a.a}/${a.p}`).join('; '),
    );
}

for (const r of safe.slice(0, 20)) {
  console.log(`SAFE ${r.code} ${r.name} +${r.addCount} ${r.before}→${r.after}`);
}
if (safe.length > 20) console.log('... safe +', safe.length - 20);
for (const r of unsafe.slice(0, 15)) {
  console.log(`UNSAFE ${r.code} ${r.name} +${r.addCount} ${r.before}→${r.after} aug=${r.augBal}`);
}
if (unsafe.length > 15) console.log('... unsafe +', unsafe.length - 15);
