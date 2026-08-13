/**
 * 팀코리아·해림운수 공문 반영 확인
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { asc, eq, ilike, like, sql } from 'drizzle-orm';

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

import { getDb } from '../db';
import { arrearsEntries, arrearsLetterLines } from '../db/schema';

async function show(pattern: string) {
  const db = getDb();
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(ilike(arrearsEntries.companyName, pattern))
    .limit(5);
  for (const h of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, h.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
    const bySrc: Record<string, number> = {};
    for (const l of lines) bySrc[l.source] = (bySrc[l.source] || 0) + 1;
    console.log(
      `\n${h.externalCode} ${h.companyName} 원장=${h.balance.toLocaleString('ko-KR')} 내역=${open.toLocaleString('ko-KR')} 차=${(h.balance - open).toLocaleString('ko-KR')} 줄=${JSON.stringify(bySrc)}`,
    );
    for (const l of lines.slice(0, 6)) {
      console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ''}`);
    }
    if (lines.length > 6) console.log(`  … +${lines.length - 6}줄`);
  }
}

async function main() {
  const db = getDb();
  const [letterOnly] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(arrearsEntries)
    .where(like(arrearsEntries.externalCode, 'letter:%'));
  console.log('연결필요 letter:', letterOnly?.n);
  await show('%팀코리아%');
  await show('%해림운수%');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
