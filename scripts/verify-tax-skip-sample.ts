/**
 * 퍼스트 등 A규칙 샘플 확인
 * npx tsx scripts/verify-tax-skip-sample.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { asc, eq, ilike, sql } from 'drizzle-orm';

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
import { listLedgerBalanceMismatches } from '../lib/arrearsLetterDb';

async function main() {
  const db = getDb();
  const [counts] = await db
    .select({
      tax: sql<number>`count(*) filter (where ${arrearsLetterLines.source} = 'tax')::int`,
      letter: sql<number>`count(*) filter (where ${arrearsLetterLines.source} = 'letter')::int`,
      ledger: sql<number>`count(*) filter (where ${arrearsLetterLines.source} = 'ledger')::int`,
    })
    .from(arrearsLetterLines);
  const mm = await listLedgerBalanceMismatches();
  console.log('lines', counts, '· mismatch', mm.count);

  for (const name of ['%퍼스트%', '%에스와이메탈%']) {
    const hits = await db
      .select()
      .from(arrearsEntries)
      .where(ilike(arrearsEntries.companyName, name))
      .limit(3);
    for (const h of hits) {
      const lines = await db
        .select()
        .from(arrearsLetterLines)
        .where(eq(arrearsLetterLines.arrearsEntryId, h.id))
        .orderBy(asc(arrearsLetterLines.sortOrder));
      const open = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
      console.log(
        `\n${h.externalCode} ${h.companyName} 원장=${h.balance} 내역=${open} 차=${h.balance - open}`,
      );
      for (const l of lines) {
        console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount}`);
      }
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
