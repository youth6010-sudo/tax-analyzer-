/**
 * 현황 잔액 vs 공문 상세 + 상세 내부(합계·행잔액) 전수 점검
 * node --import tsx scripts/audit-balance-letter-full.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(root, name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines } from '../lib/arrearsLetterDb.ts';
import { isArrearsLetterProtected } from '../lib/arrearsBalanceLock.ts';
import {
  letterBalanceFromLines,
  letterRunningBalances,
} from '../app/types/arrears.ts';
import { classifyBalanceDiff } from '../lib/arrearsBalanceDiff.ts';

const db = getDb();
const entries = await db.select().from(arrearsEntries);

const withLetter = [];
const mismatches = [];
const ledgerOnly = [];
const internalErrors = [];
const protectedMismatch = [];

for (const e of entries) {
  const lines = await listLetterLines(e.id);
  const bal = Math.round(e.balance);
  const open = letterBalanceFromLines(lines);
  const hasLetter = lines.some(l => l.source === 'letter');
  const kind = classifyBalanceDiff({
    ledgerBalance: bal,
    linesOpen: open,
    hasLetter,
  });

  // 상세 내부: 합계 = 누적잔액 끝, 지급>금액, NaN 등
  const running = letterRunningBalances(lines);
  const lastRun = running.length ? running[running.length - 1] : 0;
  const issues = [];
  if (lines.length && lastRun !== open) {
    issues.push(`누적끝(${lastRun})≠Σ(금액-지급)(${open})`);
  }
  for (const l of lines) {
    const amt = Math.round(l.amount);
    const paid = Math.round(l.paidAmount || 0);
    if (!Number.isFinite(amt) || !Number.isFinite(paid)) {
      issues.push(`비정상숫자: ${l.description}`);
    }
    if (paid > amt && amt > 0) {
      issues.push(`지급>금액: ${l.description} (${paid}>${amt})`);
    }
    if (paid < 0 || amt < 0) {
      // 음수 금액은 선수금 대체 등 정상일 수 있음 — 지급만 음수면 이상
      if (paid < 0) issues.push(`음수지급: ${l.description}`);
    }
  }
  if (issues.length) {
    internalErrors.push({
      code: e.externalCode,
      name: e.companyName,
      bal,
      open,
      issues,
      lineCount: lines.length,
    });
  }

  if (bal === open) continue;

  const row = {
    code: e.externalCode,
    name: e.companyName,
    bal,
    open,
    diff: bal - open,
    kind,
    hasLetter,
    letterLines: lines.filter(l => l.source === 'letter').length,
    totalLines: lines.length,
    protected: isArrearsLetterProtected(e.externalCode),
    manager: e.managerName || '',
  };

  if (row.protected) {
    protectedMismatch.push(row);
    continue;
  }
  if (kind === 'ledger_only') {
    ledgerOnly.push(row);
    continue;
  }
  if (kind === 'mismatch') {
    mismatches.push(row);
    if (hasLetter) withLetter.push(row);
  }
}

mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
withLetter.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
ledgerOnly.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

const feeUnit = new Set([55000, 110000, 165000, 220000, 275000, 330000, 440000, 550000]);
function hint(r) {
  const abs = Math.abs(r.diff);
  if (/양수도/.test(r.name) || r.code === '01418' || r.code === '00637') return '양수도·이관 공문줄';
  if (feeUnit.has(abs) || feeUnit.has(abs % 220000) || [165000, 220000, 440000].includes(abs))
    return '월수수료 단위(즉시회수 미제외·과다 가능)';
  if (r.diff < 0) return '공문합>현황';
  return '현황>공문합';
}

const mismatchAnnotated = mismatches.map(r => ({ ...r, hint: hint(r) }));
const withLetterAnnotated = withLetter.map(r => ({ ...r, hint: hint(r) }));

const byHint = {};
for (const r of withLetterAnnotated) {
  byHint[r.hint] = (byHint[r.hint] || 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  summary: {
    entryCount: entries.length,
    statusVsLetterMismatch: mismatches.length,
    withLetterMismatch: withLetter.length,
    ledgerOnly: ledgerOnly.length,
    protectedMismatch: protectedMismatch.length,
    internalDetailErrors: internalErrors.length,
    withLetterAbsSum: withLetter.reduce((s, r) => s + Math.abs(r.diff), 0),
    byHint,
  },
  withLetterMismatch: withLetterAnnotated,
  allMismatchTop: mismatchAnnotated.slice(0, 60),
  ledgerOnlySample: ledgerOnly.slice(0, 25),
  protectedMismatch,
  internalErrors,
};

const outPath = path.join(root, 'scripts', '_audit-balance-letter-full.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary, null, 2));
console.log('\n=== 공문 있는 잔액≠상세 (' + withLetter.length + ') ===');
for (const r of withLetterAnnotated) {
  console.log(
    `${r.code}\t${r.name}\tbal=${r.bal}\topen=${r.open}\tdiff=${r.diff}\t${r.hint}`,
  );
}
console.log('\n=== 상세 내부 오류 (' + internalErrors.length + ') ===');
for (const r of internalErrors) {
  console.log(`${r.code}\t${r.name}\t${r.issues.join(' | ')}`);
}
console.log(`\nwrote ${outPath}`);
