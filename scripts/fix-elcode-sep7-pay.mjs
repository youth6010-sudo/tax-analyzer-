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
const { listLetterLines, replaceLetterLines } = await import('../lib/arrearsLetterDb.ts');
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');

const db = getDb();
const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, '01213')).limit(1);
const lines = await listLetterLines(e.id);
const payIdx = lines.findIndex(
  l => (l.description || '') === '엘코드(05)' && Math.round(l.paidAmount || 0) === 165000 && /9월\s*7/.test(l.paidDate || ''),
);
const chargeIdx = lines.findIndex(l => (l.description || '') === '2026년 8월' && Math.round(l.paidAmount || 0) === 0);
if (payIdx < 0 || chargeIdx < 0) {
  console.log('target not found', payIdx, chargeIdx);
  process.exit(1);
}
const next = lines
  .map((l, i) => ({
    description: l.description || '',
    amount: l.amount,
    paidAmount: i === chargeIdx ? 165000 : Math.round(l.paidAmount || 0),
    paidDate: i === chargeIdx ? '9월 7일' : l.paidDate || '',
    source: l.source,
  }))
  .filter((_, i) => i !== payIdx);

await replaceLetterLines(e.id, 'fix-elcode-sep7-pay', next, { syncBalance: false });
const v = await listLetterLines(e.id);
for (const l of v.slice(-5)) console.log(JSON.stringify(l.description), l.amount, l.paidAmount, JSON.stringify(l.paidDate));
console.log('open', letterBalanceFromLines(v), 'bal', e.balance);
process.exit(0);
