/**
 * 잔액 < 0 거래처: 미수내역 유무 조사 → 전부 공문줄 삭제(원장만)
 * node --import tsx scripts/fix-negative-bal-ledger-only.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lt, sql } from 'drizzle-orm';

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
import { arrearsEntries, arrearsLetterLines } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import { letterBalanceFromLines } from '../app/types/arrears.ts';
import { isArrearsLetterContentFrozen } from '../lib/arrearsBalanceLock.ts';

const db = getDb();

const negatives = await db
  .select()
  .from(arrearsEntries)
  .where(lt(arrearsEntries.balance, 0))
  .orderBy(arrearsEntries.balance);

const withLines = [];
const withoutLines = [];
const frozenSkipped = [];

for (const e of negatives) {
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const row = {
    code: e.externalCode,
    name: e.companyName,
    bal: Math.round(e.balance),
    lineCount: lines.length,
    open,
    manager: e.managerName || '',
    frozen: isArrearsLetterContentFrozen(e.externalCode),
    sample: lines.slice(0, 3).map(l => `${l.description}|${l.amount}|${l.paidAmount}`),
  };
  if (lines.length > 0) withLines.push(row);
  else withoutLines.push(row);
}

console.log('\n=== 미수내역 있음 (잔액<0)', withLines.length, '===');
for (const r of withLines) {
  console.log(
    `${r.code}\t${r.bal}\tlines=${r.lineCount}\topen=${r.open}\t${r.frozen ? 'FROZEN' : ''}\t${r.name}`,
  );
}
console.log('\n=== 미수내역 없음 (잔액<0)', withoutLines.length, '===');
for (const r of withoutLines) {
  console.log(`${r.code}\t${r.bal}\t${r.name}`);
}

if (APPLY) {
  for (const r of withLines) {
    if (r.frozen) {
      frozenSkipped.push(r);
      console.log('SKIP frozen', r.code, r.name);
      continue;
    }
    const [e] = negatives.filter(x => x.externalCode === r.code);
    await replaceLetterLines(e.id, 'fix-negative-bal-ledger-only', [], { syncBalance: false });
    console.log('CLEARED', r.code, r.name, `lines ${r.lineCount}→0`);
  }
}

const out = path.join(root, 'data/_fix-negative-bal-ledger-only.json');
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      apply: APPLY,
      withLines,
      withoutLines,
      frozenSkipped,
      totals: {
        negative: negatives.length,
        withLines: withLines.length,
        withoutLines: withoutLines.length,
        cleared: APPLY ? withLines.length - frozenSkipped.length : 0,
      },
    },
    null,
    2,
  ),
);
console.log('\n', APPLY ? 'APPLIED' : 'DRY-RUN', '→', out);
process.exit(0);
