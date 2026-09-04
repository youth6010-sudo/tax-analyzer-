/**
 * 현황보다 공문합이 큰 경우: 끝에 남은 미입금 월기장(ledger)이 차이액과 같으면 제거
 * (즉시입금되어 현황에만 반영된 달 — 올바릇 8월 등)
 *
 * node --import tsx scripts/strip-overage-unpaid-months.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
import { letterBalanceFromLines } from '../app/types/arrears.ts';
import { isArrearsLetterProtected } from '../lib/arrearsBalanceLock.ts';

function isUnpaidMonthLedger(l) {
  if (l.source !== 'ledger') return false;
  if (Math.round(l.amount) <= 0) return false;
  if (Math.round(l.paidAmount) !== 0) return false;
  const d = String(l.description || '').replace(/\s+/g, '');
  return /\d{1,2}월/.test(d);
}

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const report = [];

for (const e of entries) {
  if (isArrearsLetterProtected(e.externalCode)) continue;

  const lines = await listLetterLines(e.id);
  let open = letterBalanceFromLines(lines);
  const bal = Math.round(e.balance);
  let over = open - bal;
  if (over <= 0) continue;

  const next = lines.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source,
  }));

  const removed = [];
  // 끝에서부터 미입금 월기장을 빼서 차이 해소
  for (let i = next.length - 1; i >= 0 && over > 0; i--) {
    const l = next[i];
    if (!isUnpaidMonthLedger(l)) continue;
    const amt = Math.round(l.amount);
    if (amt > over) continue;
    removed.push(`${l.description}=${amt}`);
    next.splice(i, 1);
    over -= amt;
  }

  if (!removed.length) continue;
  const after = letterBalanceFromLines(next);
  if (after !== bal && Math.abs(after - bal) >= Math.abs(open - bal)) {
    // 더 안 맞으면 스킵
    continue;
  }

  report.push({
    code: e.externalCode,
    name: e.companyName,
    bal,
    openBefore: open,
    openAfter: after,
    removed,
  });

  if (APPLY) {
    await replaceLetterLines(e.id, 'strip-overage-unpaid-months', next, { syncBalance: false });
  }
}

console.log(JSON.stringify(report, null, 2));
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'}: ${report.length} companies`);
if (!APPLY) console.log('Re-run with --apply');
