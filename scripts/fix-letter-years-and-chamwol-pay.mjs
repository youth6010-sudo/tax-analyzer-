/**
 * 전 업체: 차월 지급→직전월 기장 병합 + 2자리 연도→4자리
 * node --import tsx scripts/fix-letter-years-and-chamwol-pay.mjs [--apply]
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
import {
  mergeMonthlyBookkeepingPaymentRows,
  normalizeLetterLineYears,
} from '../lib/arrearsMergeMonthPayments.ts';

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const report = [];

for (const e of entries) {
  const before = await listLetterLines(e.id);
  if (!before.length) continue;

  const inputs = before.map(l => ({
    description: l.description || '',
    amount: l.amount,
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source,
  }));

  const years = normalizeLetterLineYears(inputs);
  const merged = mergeMonthlyBookkeepingPaymentRows(years);

  const yearChanged = years.some((l, i) => l.description !== inputs[i]?.description);
  const mergeChanged = merged.length !== before.length ||
    merged.some((l, i) => {
      const b = years[i];
      if (!b) return true;
      return (
        l.description !== b.description ||
        Math.round(l.paidAmount || 0) !== Math.round(b.paidAmount || 0) ||
        (l.paidDate || '') !== (b.paidDate || '')
      );
    });

  // merge may reorder/shorten — compare open
  const openBefore = letterBalanceFromLines(before);
  const openAfter = letterBalanceFromLines(merged);
  if (openBefore !== openAfter) {
    console.log('SKIP open drift', e.externalCode, e.companyName, openBefore, '→', openAfter);
    continue;
  }

  if (!yearChanged && !mergeChanged && merged.length === before.length) {
    // still check description year-only change already covered
    const same = merged.every((l, i) => {
      const b = before[i];
      return (
        b &&
        l.description === (b.description || '') &&
        Math.round(l.paidAmount || 0) === Math.round(b.paidAmount || 0) &&
        (l.paidDate || '') === (b.paidDate || '')
      );
    });
    if (same) continue;
  }

  report.push({
    code: e.externalCode,
    name: e.companyName,
    lines: `${before.length}→${merged.length}`,
    yearChanged,
    mergeChanged,
  });

  if (APPLY) {
    await replaceLetterLines(e.id, 'fix-letter-years-chamwol', merged, {
      syncBalance: false,
    });
  }
}

console.log(APPLY ? 'APPLIED' : 'DRY', report.length);
for (const r of report.slice(0, 50)) {
  console.log(r.code, r.name, r.lines, r.yearChanged ? 'YEAR' : '', r.mergeChanged ? 'MERGE' : '');
}
if (report.length > 50) console.log('...', report.length - 50, 'more');
fs.writeFileSync(
  path.join(root, 'data/_fix-letter-years-chamwol.json'),
  JSON.stringify({ apply: APPLY, report }, null, 2),
);
process.exit(0);
