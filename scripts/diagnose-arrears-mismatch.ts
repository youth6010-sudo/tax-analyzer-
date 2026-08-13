/**
 * 공문 반영/불일치 원인 진단
 * npx tsx scripts/diagnose-arrears-mismatch.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { asc, eq, like, sql } from 'drizzle-orm';

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
import { softCompanyKey } from '../lib/arrearsMatchReview';

async function main() {
  const db = getDb();

  const letterOnly = await db
    .select()
    .from(arrearsEntries)
    .where(like(arrearsEntries.externalCode, 'letter:%'));
  console.log('=== 연결필요 letter: 행', letterOnly.length, '===');
  for (const e of letterOnly) {
    const [s] = await db
      .select({
        n: sql<number>`count(*)::int`,
        open: sql<number>`coalesce(sum(${arrearsLetterLines.amount} - ${arrearsLetterLines.paidAmount}), 0)`,
      })
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id));
    console.log(
      `  [${e.managerName}] ${e.companyName} · 줄 ${s?.n ?? 0} · open ${Math.round(Number(s?.open) || 0)} · bal ${e.balance}`,
    );
  }

  const coded = await db
    .select({
      id: arrearsEntries.id,
      companyName: arrearsEntries.companyName,
      externalCode: arrearsEntries.externalCode,
    })
    .from(arrearsEntries)
    .where(sql`${arrearsEntries.externalCode} not like 'letter:%'`);

  const softCoded = new Map<string, typeof coded>();
  for (const c of coded) {
    const k = softCompanyKey(c.companyName);
    if (!k) continue;
    const list = softCoded.get(k) ?? [];
    list.push(c);
    softCoded.set(k, list);
  }

  console.log('\n=== 연결필요 ↔ 원장 soft키 후보 ===');
  for (const e of letterOnly) {
    const k = softCompanyKey(e.companyName);
    const hits = softCoded.get(k) ?? [];
    const fuzzy = coded
      .map(c => ({
        c,
        score:
          softCompanyKey(c.companyName).includes(k) || k.includes(softCompanyKey(c.companyName))
            ? 1
            : 0,
      }))
      .filter(x => x.score && softCompanyKey(x.c.companyName) !== k)
      .slice(0, 5);
    console.log(
      `  ${e.companyName} → exact ${hits.length ? hits.map(h => `${h.externalCode}:${h.companyName}`).join(', ') : '(없음)'}`,
    );
    if (!hits.length && fuzzy.length) {
      console.log(`    포함후보: ${fuzzy.map(f => `${f.c.externalCode}:${f.c.companyName}`).join(', ')}`);
    }
  }

  const mm = await listLedgerBalanceMismatches({ limit: 12 });
  console.log('\n=== 불일치 top', mm.count, '중 12 ===');

  let hasLetterAndTax = 0;
  let letterOnlyLines = 0;
  let taxOnlyLines = 0;
  let noLines = 0;
  let linesGtLedger = 0;
  let linesLtLedger = 0;

  const all = await listLedgerBalanceMismatches();
  for (const m of all.items) {
    if (m.diff > 0) linesLtLedger += 1;
    else linesGtLedger += 1;
    const lines = await db
      .select({
        source: arrearsLetterLines.source,
      })
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, m.entryId));
    const hasL = lines.some(l => l.source === 'letter');
    const hasT = lines.some(l => l.source === 'tax');
    if (!lines.length) noLines += 1;
    else if (hasL && hasT) hasLetterAndTax += 1;
    else if (hasL) letterOnlyLines += 1;
    else if (hasT) taxOnlyLines += 1;
  }
  console.log('분류: 내역>원장', linesGtLedger, '· 내역<원장', linesLtLedger);
  console.log(
    '출처: letter+tax',
    hasLetterAndTax,
    '· letter만',
    letterOnlyLines,
    '· tax만',
    taxOnlyLines,
    '· 줄없음',
    noLines,
  );

  for (const m of mm.items) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, m.entryId))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const bySrc: Record<string, number> = {};
    for (const l of lines) bySrc[l.source] = (bySrc[l.source] || 0) + 1;
    console.log(
      `\n${m.externalCode} ${m.companyName}\n  원장 ${m.ledgerBalance.toLocaleString('ko-KR')} · 내역 ${m.linesOpen.toLocaleString('ko-KR')} · 차 ${m.diff.toLocaleString('ko-KR')} · 줄 ${JSON.stringify(bySrc)}`,
    );
    for (const l of lines.slice(0, 4)) {
      console.log(`    [${l.source}] ${l.description} +${l.amount} -${l.paidAmount}`);
    }
    if (lines.length > 4) console.log(`    … +${lines.length - 4}줄`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
