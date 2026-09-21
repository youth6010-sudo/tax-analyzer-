/**
 * 잔액 0 거래처: 미수내역 있으면 전부 삭제(세부 안 보이게)
 * node --import tsx scripts/fix-zero-bal-clear-lines.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

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
import { isArrearsLetterContentFrozen } from '../lib/arrearsBalanceLock.ts';

const db = getDb();

const zeros = await db.select().from(arrearsEntries).where(eq(arrearsEntries.balance, 0));

const withLines = [];
const withoutLines = [];
const frozenForced = [];

for (const e of zeros) {
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const row = {
    code: e.externalCode,
    name: e.companyName,
    bal: 0,
    lineCount: lines.length,
    open,
    frozen: isArrearsLetterContentFrozen(e.externalCode),
  };
  if (lines.length > 0) withLines.push(row);
  else withoutLines.push(row);
}

console.log('\n=== 잔액0 · 미수내역 있음', withLines.length, '===');
for (const r of withLines) {
  console.log(
    `${r.code}\topen=${r.open}\tlines=${r.lineCount}\t${r.frozen ? 'FROZEN→강제삭제' : ''}\t${r.name}`,
  );
}
console.log('\n=== 잔액0 · 미수내역 없음', withoutLines.length, '===');

if (APPLY) {
  for (const e of zeros) {
    const lines = await listLetterLines(e.id);
    if (!lines.length) continue;
    if (isArrearsLetterContentFrozen(e.externalCode)) {
      frozenForced.push({ code: e.externalCode, name: e.companyName, lineCount: lines.length });
    }
    try {
      // inactive 코드는 replaceLetterLines가 막으므로 시드 액터로 우회
      await replaceLetterLines(e.id, 'inactive-arrears-seed', [], { syncBalance: false });
      console.log('CLEARED', e.externalCode, e.companyName, `lines ${lines.length}→0`);
    } catch (err) {
      console.error('FAIL', e.externalCode, e.companyName, String(err?.message || err));
      throw err;
    }
  }
}

const out = path.join(root, 'data/_fix-zero-bal-clear-lines.json');
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      apply: APPLY,
      withLines,
      withoutCount: withoutLines.length,
      frozenForced,
      totals: {
        zero: zeros.length,
        withLines: withLines.length,
        withoutLines: withoutLines.length,
      },
    },
    null,
    2,
  ),
);
console.log('\n', APPLY ? 'APPLIED' : 'DRY-RUN', '→', out);
process.exit(0);
