/**
 * node --import tsx scripts/inspect-audit-targets.mjs
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
import { listLetterLines } from '../lib/arrearsLetterDb.ts';
import {
  letterBalanceFromLines,
  letterRunningBalances,
} from '../app/types/arrears.ts';

const db = getDb();
const codes = ['01418', '00165', '01671'];

for (const code of codes) {
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, code))
    .limit(1);
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const run = letterRunningBalances(lines);
  console.log(
    `\n=== ${code} ${e.companyName} bal=${e.balance} open=${open} runEnd=${run[run.length - 1]}`,
  );
  for (const l of lines) {
    console.log(
      `${l.source}\t${String(l.description || '').slice(0, 40)}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ''}`,
    );
  }
}

const all = await db.select().from(arrearsEntries);
let mathBreak = 0;
for (const e of all) {
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const run = letterRunningBalances(lines);
  const last = run.length ? run[run.length - 1] : 0;
  if (lines.length && last !== open) {
    mathBreak += 1;
    console.log('MATH', e.externalCode, e.companyName, last, open);
  }
}
console.log('\nmathBreak count', mathBreak);
