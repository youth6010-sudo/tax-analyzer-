import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { getDb } = await import('../db/index.ts');
const { arrearsEntries } = await import('../db/schema.ts');
const { listLetterLines } = await import('../lib/arrearsLetterDb.ts');
const { applyClientDetailImport } = await import('../lib/arrearsImportApply.ts');
const { mergeMonthlyBookkeepingPaymentRows, normalizeLetterLineYears } = await import('../lib/arrearsMergeMonthPayments.ts');
const { formatArrearsPaidDateKo } = await import('../app/types/arrears.ts');
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');

const file = process.argv[2] || 'c:/Users/ADMIN/Downloads/거래처별 현황_20260920.xlsx';
const planned = [];
const res = await applyClientDetailImport(fs.readFileSync(file), 'dry-run', undefined, (code, lines) => planned.push({ code, lines }));
console.log('result', JSON.stringify(res));

const fmt = l => `${l.description}|${Math.round(l.amount)}|${Math.round(l.paidAmount || 0)}|${String(l.paidDate || '').replace(/\s+/g, '')}`;
const db = getDb();
let changed = 0;
for (const { code, lines } of planned) {
  const norm = lines.map(l => ({
    description: String(l.description || '').trim(),
    amount: Math.round(Number(l.amount) || 0),
    paidAmount: Math.round(Number(l.paidAmount) || 0),
    paidDate: formatArrearsPaidDateKo(String(l.paidDate || '').trim()),
    source: l.source,
  })).filter(l => l.description || l.amount || l.paidAmount);
  const after = mergeMonthlyBookkeepingPaymentRows(normalizeLetterLineYears(norm));
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1);
  const before = await listLetterLines(e.id);
  const a = after.map(fmt), b = before.map(fmt);
  if (a.join('\n') === b.join('\n')) continue;
  changed += 1;
  console.log(`\n== ${code} ${e.companyName} bal ${e.balance} open ${letterBalanceFromLines(before)} -> ${letterBalanceFromLines(after)}`);
  for (const x of b) if (!a.includes(x)) console.log('  -', x);
  for (const x of a) if (!b.includes(x)) console.log('  +', x);
}
console.log('\nplanned saves', planned.length, 'actually changed', changed);
process.exit(0);
