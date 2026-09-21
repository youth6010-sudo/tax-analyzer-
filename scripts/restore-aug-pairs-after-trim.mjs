/**
 * trim-to-aug31로 지워진 8월 기장·입금 복구
 * — 공문에 기장 미납이 있으면 엑셀의 8월 매출+입금은 둘 다 유지 (도리F&B 등)
 *
 * node --import tsx scripts/restore-aug-pairs-after-trim.mjs [--apply] [--code=00156]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import * as XLSX from 'xlsx';

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
const { eq } = await import('drizzle-orm');

function cellStr(v) {
  return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
}
function cellMoney(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** code -> { fee: number, pay: number } for 2026-08 from 거래처별 현황 */
function augPairsFromExcel(filePath) {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
  const out = new Map();
  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^\((\d{3,})\)/);
    if (!m) continue;
    const code = m[1].padStart(5, '0');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    });
    let fee = 0;
    let pay = 0;
    for (const row of rows) {
      const dateRaw = cellStr(row[0]);
      const desc = cellStr(row[3]);
      const debit = cellMoney(row[5]);
      const credit = cellMoney(row[6]);
      if (!/^\d{2}-\d{2}$/.test(dateRaw) && !(row[0] instanceof Date)) continue;
      let mm = '';
      if (/^\d{2}-\d{2}$/.test(dateRaw)) mm = dateRaw.slice(0, 2);
      else if (row[0] instanceof Date) mm = String(row[0].getMonth() + 1).padStart(2, '0');
      if (mm !== '08') continue;
      if (debit > 0 && /기장|월/.test(desc.replace(/\s/g, ''))) fee += debit;
      if (credit > 0) pay += credit;
    }
    if (fee > 0 || pay > 0) out.set(code, { fee, pay });
  }
  return out;
}

function hasAugFee(lines) {
  return lines.some(l => {
    const d = String(l.description || '').replace(/\s+/g, '');
    return /(?:2026|26)년8월/.test(d) && Math.round(l.amount) > 0;
  });
}

/** 2026년 구간 끝쪽에 8월 입금이 있는지 (과거 연도 「8월 n일」지급일과 구분) */
function hasAugPay(lines) {
  let saw2026 = false;
  for (const l of lines) {
    const d = String(l.description || '').replace(/\s+/g, '');
    if (/(?:2026|26)년/.test(d)) saw2026 = true;
    if (!saw2026) continue;
    const paid = Math.round(l.paidAmount || 0);
    if (paid <= 0) continue;
    // 2026년 7월 줄 이후·말단에 붙은 8월 지급만
    const pd = String(l.paidDate || '').replace(/\s+/g, '');
    if (/^8월/.test(pd) || /2026\.08|2026-08/.test(pd)) return true;
  }
  // 말단 5줄만 추가로 검사
  for (const l of lines.slice(-5)) {
    const paid = Math.round(l.paidAmount || 0);
    if (paid <= 0) continue;
    const pd = String(l.paidDate || '').replace(/\s+/g, '');
    const d = String(l.description || '').replace(/\s+/g, '');
    if (/^8월/.test(pd) && !/(?:19|20|21|22|23|24|25)년/.test(d)) return true;
  }
  return false;
}

const detailPath = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260831.xlsx';
const pairs = augPairsFromExcel(detailPath);
console.log('excel aug pairs', pairs.size);

const db = getDb();
const entries = onlyCode
  ? await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, onlyCode))
  : await db.select().from(arrearsEntries);

const report = [];

for (const e of entries) {
  const code = String(e.externalCode || '').padStart(5, '0');
  const pair = pairs.get(code);
  if (!pair) continue;

  const lines = await listLetterLines(e.id);
  if (!hasUnpaidMonthBookkeepingOnLetter(lines)) continue;
  if (hasAugFee(lines) && hasAugPay(lines)) continue;
  if (!pair.fee && !pair.pay) continue;

  // 자동 복구는 엑셀에 8월 기장+입금이 둘 다 있고, 공문에도 둘 다 없을 때만
  // (한쪽만 넣으면 잔액이 어긋남). 단건 --code= 지정 시 예외 허용.
  const needFee = pair.fee > 0 && !hasAugFee(lines);
  const needPay = pair.pay > 0 && !hasAugPay(lines);
  if (!needFee && !needPay) continue;
  if (!onlyCode && !(needFee && needPay && pair.fee > 0 && pair.pay > 0)) continue;
  // 단건 지정인데 입금 오탐이면 강제 입금 복구
  const forcePay = Boolean(onlyCode) && pair.pay > 0 && needFee;

  const next = lines.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  }));

  if (needPay || forcePay) {
    next.push({
      description: '',
      amount: 0,
      paidAmount: pair.pay,
      paidDate: '8월 20일',
      source: 'ledger',
    });
  }
  if (needFee) {
    next.push({
      description: '2026년 8월',
      amount: pair.fee,
      paidAmount: 0,
      paidDate: '',
      source: 'ledger',
    });
  }

  const before = letterBalanceFromLines(lines);
  const after = letterBalanceFromLines(next);
  report.push({
    code,
    name: e.companyName,
    needFee,
    needPay: needPay || forcePay,
    fee: pair.fee,
    pay: pair.pay,
    before,
    after,
    bal: Math.round(e.balance),
  });

  if (APPLY) {
    await replaceLetterLines(e.id, 'restore-aug-pairs', next, { syncBalance: false });
  }
}

console.log(APPLY ? 'APPLY' : 'DRY-RUN', 'restore', report.length);
for (const r of report) {
  console.log(
    `${r.code} ${r.name} fee=${r.needFee ? r.fee : '-'} pay=${r.needPay ? r.pay : '-'} open ${r.before}→${r.after} bal=${r.bal}`,
  );
}

fs.writeFileSync(
  path.join(root, 'data/_restore-aug-pairs.json'),
  JSON.stringify({ apply: APPLY, report }, null, 2),
  'utf8',
);
