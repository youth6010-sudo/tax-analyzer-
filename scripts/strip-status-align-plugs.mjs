/**
 * 「미수반영(현황맞춤)」「입금(현황맞춤)」 임시 조정 줄 제거
 * node --import tsx scripts/strip-status-align-plugs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const { getDb } = await import('../db/index.ts');
const { arrearsEntries, arrearsLetterLines } = await import('../db/schema.ts');
const { eq, or, like, inArray } = await import('drizzle-orm');
const { listLetterLines, replaceLetterLines } = await import('../lib/arrearsLetterDb.ts');

const db = getDb();
const plugs = await db
  .select({
    entryId: arrearsLetterLines.arrearsEntryId,
  })
  .from(arrearsLetterLines)
  .where(
    or(
      like(arrearsLetterLines.description, '%현황맞춤%'),
      like(arrearsLetterLines.description, '%말잔맞춤%'),
    ),
  );

const entryIds = [...new Set(plugs.map(p => p.entryId))];
console.log('entries with plugs', entryIds.length, 'plug rows', plugs.length);

let cleaned = 0;
for (const entryId of entryIds) {
  const lines = await listLetterLines(entryId);
  const next = lines
    .filter(l => !/현황맞춤|말잔맞춤/.test(String(l.description || '').replace(/\s+/g, '')))
    .map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: l.source,
    }));
  if (next.length === lines.length) continue;
  await replaceLetterLines(entryId, 'strip-status-align-plugs', next, { syncBalance: false });
  cleaned += 1;
}
console.log('cleaned', cleaned);

const left = await db
  .select({ n: arrearsLetterLines.id })
  .from(arrearsLetterLines)
  .where(
    or(
      like(arrearsLetterLines.description, '%현황맞춤%'),
      like(arrearsLetterLines.description, '%말잔맞춤%'),
    ),
  );
console.log('remaining plugs', left.length);
