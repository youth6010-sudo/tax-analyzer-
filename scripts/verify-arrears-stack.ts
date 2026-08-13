/**
 * 3단 재구성 후 간단 검증
 * npx tsx scripts/verify-arrears-stack.ts
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

import { sql, like } from 'drizzle-orm';
import { getDb } from '../db';
import { arrearsEntries, arrearsLetterLines } from '../db/schema';

async function main() {
  const db = getDb();
  const [entryCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(arrearsEntries);
  const [letterOnly] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(arrearsEntries)
    .where(like(arrearsEntries.externalCode, 'letter:%'));
  const [lines] = await db
    .select({
      total: sql<number>`count(*)::int`,
      tax: sql<number>`count(*) filter (where ${arrearsLetterLines.source} = 'tax')::int`,
      letter: sql<number>`count(*) filter (where ${arrearsLetterLines.source} = 'letter')::int`,
      ledger: sql<number>`count(*) filter (where ${arrearsLetterLines.source} = 'ledger')::int`,
    })
    .from(arrearsLetterLines);

  const samples = await db.execute(sql`
    select e.company_name, e.external_code, e.balance,
      sum(case when l.source='tax' then 1 else 0 end)::int as tax_n,
      sum(case when l.source='letter' then 1 else 0 end)::int as letter_n,
      sum(case when l.source='ledger' then 1 else 0 end)::int as ledger_n,
      coalesce(sum(l.amount - l.paid_amount),0)::bigint as line_open
    from arrears_entries e
    join arrears_letter_lines l on l.arrears_entry_id = e.id
    group by e.id
    having sum(case when l.source='tax' then 1 else 0 end) > 0
      and sum(case when l.source='letter' then 1 else 0 end) > 0
    order by tax_n desc
    limit 5
  `);

  console.log('entries', entryCount?.n, '· letter-only(연결필요)', letterOnly?.n);
  console.log('lines', lines);
  console.log('sample (letter+tax):');
  console.log(samples);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
