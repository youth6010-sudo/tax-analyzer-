/**
 * 전 업체: 월 기장료 + 지급 분리 줄 → 6월처럼 한 줄로 병합
 * node --import tsx scripts/merge-month-bk-payments-all.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

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
import { letterOpenForStatusMatch } from '../lib/arrearsLetterOpen.ts';
import { mergeMonthlyBookkeepingPaymentRows } from '../lib/arrearsMergeMonthPayments.ts';

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const report = [];

for (const e of entries) {
  const before = await listLetterLines(e.id);
  if (before.length < 2) continue;
  const inputs = before.map(l => ({
    description: l.description || '',
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source,
  }));
  const merged = mergeMonthlyBookkeepingPaymentRows(inputs);
  if (merged.length >= before.length) continue;

  const openBefore = letterBalanceFromLines(before);
  const openAfter = letterBalanceFromLines(merged);
  if (openBefore !== openAfter) continue;

  const statusBefore = letterOpenForStatusMatch(e.externalCode, before);
  const statusAfter = letterOpenForStatusMatch(e.externalCode, merged);
  report.push({
    code: e.externalCode,
    name: e.companyName,
    lines: `${before.length}→${merged.length}`,
    statusBefore,
    statusAfter,
    bal: Math.round(e.balance),
  });

  if (APPLY) {
    await replaceLetterLines(e.id, 'merge-month-bk-payments', merged, { syncBalance: false });
  }
}

console.log(APPLY ? 'APPLIED' : 'DRY', report.length, 'companies');
for (const r of report.slice(0, 40)) {
  console.log(r.code, r.name, r.lines, 'status', r.statusBefore, '→', r.statusAfter, 'bal', r.bal);
}
if (report.length > 40) console.log('...', report.length - 40, 'more');
fs.writeFileSync(
  path.join(root, 'data/_merge-month-bk-payments.json'),
  JSON.stringify({ apply: APPLY, report }, null, 2),
);
process.exit(0);
