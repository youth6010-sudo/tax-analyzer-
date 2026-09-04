/**
 * 26.07.27 공문 — 내역 빈 지급행(회수) 누락 전수 복구
 * + 월기장료=월입금(동일금액) 즉시회수 줄 제거
 *
 * node --import tsx scripts/restore-missing-blank-pays.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import {
  letterBalanceFromLines,
  formatArrearsPaidDateKo,
} from '../app/types/arrears.ts';
import { parseArrearsLetterWorkbook } from '../lib/arrearsLetterParse.ts';
import { paidDateMatchKey } from '../lib/arrearsLineLabel.ts';
import { isArrearsLetterProtected } from '../lib/arrearsBalanceLock.ts';

function normName(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[＆&]/g, '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사|\(유\)/g, '(유)')
    .replace(/[()（）·・./\-]/g, '')
    .toLowerCase();
}

function findByName(entries, sheetName) {
  const usable = entries.filter(
    e => String(e.companyName || '').trim() && String(e.externalCode || '') !== '00000',
  );
  const key = normName(sheetName);
  const byName = new Map(usable.map(e => [normName(e.companyName), e]));
  let hit = byName.get(key);
  if (hit) return hit;
  for (const [nk, row] of byName) {
    if (nk.includes(key) || key.includes(nk)) return row;
  }
  return null;
}

function payKey(paidAmount, paidDate) {
  return `${Math.round(paidAmount)}|${paidDateMatchKey(paidDate)}`;
}

/** cutoff 이후 월기장+동일금액 입금(즉시회수)만 제거. 공문 letter 완납 이력은 유지 */
function stripImmediateMonthlyRecoveries(lines) {
  const n = lines.length;
  const drop = new Set();

  const isMonthCharge = l => {
    if (Math.round(l.amount) <= 0) return false;
    if (l.source === 'letter') return false;
    const d = String(l.description || '').replace(/\s+/g, '');
    return /\d{1,2}월/.test(d);
  };
  const isPayment = l =>
    Math.round(l.paidAmount) > 0 &&
    Math.round(l.amount) === 0 &&
    l.source !== 'letter';

  for (let i = 0; i < n; i++) {
    if (drop.has(i)) continue;
    const l = lines[i];
    const amt = Math.round(l.amount);
    const paid = Math.round(l.paidAmount);
    if (amt > 0 && amt === paid && isMonthCharge(l)) {
      drop.add(i);
      continue;
    }
    if (isMonthCharge(l) && paid === 0) {
      for (let j = i + 1; j < Math.min(i + 5, n); j++) {
        if (drop.has(j)) continue;
        const p = lines[j];
        if (isPayment(p) && Math.round(p.paidAmount) === amt) {
          drop.add(i);
          drop.add(j);
          break;
        }
        if (Math.round(p.amount) > 0) break;
      }
    }
  }
  return lines.filter((_, i) => !drop.has(i));
}

const dir = path.join('z:', '10_미수관리', '미수금 공문 - 26년');
const files = fs
  .readdirSync(dir)
  .filter(f => /\.xls[x]?$/i.test(f) && /미수수수료/.test(f) && !f.includes('현황') && /26\.07\.27/.test(f))
  .map(f => path.join(dir, f));

const db = getDb();
const entries = await db.select().from(arrearsEntries);

let restored = 0;
let stripped = 0;
const report = [];

for (const filePath of files) {
  const buf = fs.readFileSync(filePath);
  const { sheets } = parseArrearsLetterWorkbook(buf);

  for (const sh of sheets) {
    const hit = findByName(entries, sh.companyName);
    if (!hit) continue;
    if (isArrearsLetterProtected(hit.externalCode)) continue;

    const blankPays = sh.lines.filter(
      l => !String(l.description || '').trim() && Math.round(l.paidAmount) > 0,
    );
    if (!blankPays.length) continue;

    const dbLines = await listLetterLines(hit.id);
    const existingKeys = new Set(
      dbLines
        .filter(l => Math.round(l.paidAmount) > 0)
        .map(l => payKey(l.paidAmount, l.paidDate)),
    );

    const missing = blankPays.filter(bp => !existingKeys.has(payKey(bp.paidAmount, bp.paidDate)));
    if (!missing.length) continue;

    // 공문 letter 줄은 엑셀 기준으로 맞추고, cutoff 이후 ledger/payment는 유지하되
    // 누락 지급만 보강하는 방식: 기존 줄 + missing blank pays
    const next = [
      ...dbLines.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || '',
        source: l.source,
      })),
    ];

    for (const bp of missing) {
      // 지급-only: 내역 비움
      next.push({
        description: '',
        amount: 0,
        paidAmount: Math.round(bp.paidAmount),
        paidDate: formatArrearsPaidDateKo(bp.paidDate) || bp.paidDate || '',
        source: 'letter',
      });
    }

    const beforeOpen = letterBalanceFromLines(dbLines);
    let cleaned = stripImmediateMonthlyRecoveries(next);
    const afterOpen = letterBalanceFromLines(cleaned);

    report.push({
      code: hit.externalCode,
      name: hit.companyName,
      missing: missing.map(m => `${m.paidAmount}@${m.paidDate}`),
      bal: hit.balance,
      openBefore: beforeOpen,
      openAfter: afterOpen,
      linesBefore: dbLines.length,
      linesAfter: cleaned.length,
      stripped: next.length - cleaned.length,
    });

    if (APPLY) {
      await replaceLetterLines(hit.id, 'restore-missing-blank-pays', cleaned, {
        syncBalance: false,
      });
    }
    restored += missing.length;
    stripped += next.length - cleaned.length;
  }
}

// --- 2) 전 업체: cutoff 이후 월기장=입금 즉시회수 줄 정리 ---
const allEntries = await db.select().from(arrearsEntries);
let stripOnly = 0;
for (const e of allEntries) {
  if (isArrearsLetterProtected(e.externalCode)) continue;
  if (report.some(r => r.code === e.externalCode)) continue; // already handled
  const dbLines = await listLetterLines(e.id);
  const cleaned = stripImmediateMonthlyRecoveries(
    dbLines.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    })),
  );
  if (cleaned.length === dbLines.length) continue;
  const beforeOpen = letterBalanceFromLines(dbLines);
  const afterOpen = letterBalanceFromLines(cleaned);
  report.push({
    code: e.externalCode,
    name: e.companyName,
    missing: [],
    bal: e.balance,
    openBefore: beforeOpen,
    openAfter: afterOpen,
    linesBefore: dbLines.length,
    linesAfter: cleaned.length,
    stripped: dbLines.length - cleaned.length,
  });
  if (APPLY) {
    await replaceLetterLines(e.id, 'strip-immediate-monthly', cleaned, { syncBalance: false });
  }
  stripOnly += dbLines.length - cleaned.length;
}

console.log(JSON.stringify(report, null, 2));
console.log(
  `\n${APPLY ? 'APPLIED' : 'DRY-RUN'}: blankPays=${restored}, strippedRows=${stripped + stripOnly}, companies=${report.length}`,
);
if (!APPLY) console.log('Re-run with --apply to write.');
