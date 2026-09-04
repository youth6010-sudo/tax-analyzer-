/**
 * 현황표 잔액 vs 공문 Σ(금액−지급) 전수 검토
 * node --import tsx scripts/audit-balance-letter-mismatch.mjs
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

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import {
  listLedgerBalanceMismatches,
  listLetterLines,
} from '../lib/arrearsLetterDb.ts';
import { getArrearsTransferPair } from '../lib/arrearsBalanceLock.ts';
import { isArrearsExcelBalanceAligned, readArrearsDetailEndings } from '../lib/arrearsDetailEndings.ts';
import { letterBalanceFromLines } from '../app/types/arrears.ts';

function classifyHint(m, lines) {
  const pair = getArrearsTransferPair(m.externalCode);
  if (pair) return '양수도(구조적 차이 가능)';
  const hasLetter = lines.some(l => l.source === 'letter');
  const hasYang = lines.some(l => /양수도/.test(l.description || ''));
  if (hasYang) return '양수도 적요 포함';
  if (!hasLetter && Math.round(m.linesOpen) === 0 && Math.round(m.ledgerBalance) !== 0)
    return '원장만(공문 없음)';
  if (!hasLetter) return '공문없음·원장줄만';
  const abs = Math.abs(m.diff);
  if (abs === 165000 || abs === 220000 || abs === 55000 || abs === 110000 || abs === 330000 || abs === 440000)
    return '월수수료 단위 차이(7·8월 누락/과다 가능)';
  if (m.diff > 0 && abs < 500000) return '현황>공문(소액·누락 가능)';
  if (m.diff < 0 && abs < 500000) return '공문>현황(과다·즉시입금 가능)';
  if (m.diff > 0) return '현황>공문(대액)';
  return '공문>현황(대액)';
}

const endings = await readArrearsDetailEndings();
const mm = await listLedgerBalanceMismatches({ kind: 'all' });

const rows = [];
for (const m of mm.items) {
  const lines = await listLetterLines(m.entryId);
  const excelOk = isArrearsExcelBalanceAligned(m.externalCode, m.ledgerBalance, endings);
  rows.push({
    code: m.externalCode,
    name: m.companyName,
    bal: Math.round(m.ledgerBalance),
    open: Math.round(m.linesOpen),
    diff: Math.round(m.diff),
    kind: m.kind,
    excelAligned: excelOk,
    letterLines: lines.filter(l => l.source === 'letter').length,
    totalLines: lines.length,
    hint: classifyHint(m, lines),
    transfer: !!getArrearsTransferPair(m.externalCode),
  });
}

// excel-aligned로 목록에서 숨겨지는지 확인용: 잔액≠줄합인데 excelAligned인 경우
const db = getDb();
const all = await db.select().from(arrearsEntries);
const hidden = [];
for (const e of all) {
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const bal = Math.round(e.balance);
  if (bal === open) continue;
  if (!isArrearsExcelBalanceAligned(e.externalCode, bal, endings)) continue;
  // already in mismatch list? skip
  if (rows.some(r => r.code === e.externalCode)) continue;
  hidden.push({
    code: e.externalCode,
    name: e.companyName,
    bal,
    open,
    diff: bal - open,
    kind: 'excel_aligned_hidden',
    excelAligned: true,
    letterLines: lines.filter(l => l.source === 'letter').length,
    totalLines: lines.length,
    hint: '현황=거래처별말잔(엑셀정렬) → 목록 불일치 숨김',
    transfer: !!getArrearsTransferPair(e.externalCode),
  });
}

rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

const mismatch = rows.filter(r => r.kind === 'mismatch');
const ledgerOnly = rows.filter(r => r.kind === 'ledger_only');

const byHint = {};
for (const r of mismatch) {
  byHint[r.hint] = (byHint[r.hint] || 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  summary: {
    mismatchCount: mismatch.length,
    ledgerOnlyCount: ledgerOnly.length,
    excelAlignedHiddenCount: hidden.length,
    mismatchAbsSum: mismatch.reduce((s, r) => s + Math.abs(r.diff), 0),
    byHint,
  },
  mismatch: mismatch.slice(0, 80),
  ledgerOnlySample: ledgerOnly.slice(0, 20),
  excelAlignedHidden: hidden.slice(0, 30),
};

const outPath = path.join(root, 'scripts', '_audit-balance-letter.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary, null, 2));
console.log('\n=== TOP mismatch (abs) ===');
for (const r of mismatch.slice(0, 40)) {
  console.log(
    `${r.code}\t${r.name}\tbal=${r.bal}\topen=${r.open}\tdiff=${r.diff}\t${r.hint}`,
  );
}
console.log(`\nwrote ${outPath}`);
