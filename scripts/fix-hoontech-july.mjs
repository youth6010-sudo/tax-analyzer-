/**
 * 훈테크(00185): 미수 누적 상태에서 빠진 2026년 7월 청구 + 8/25 회수 복구
 * node --import tsx scripts/fix-hoontech-july.mjs
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const { getDb } = await import('../db/index.ts');
const { arrearsEntries } = await import('../db/schema.ts');
const { eq } = await import('drizzle-orm');
const { listLetterLines, replaceLetterLines } = await import('../lib/arrearsLetterDb.ts');
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');

const db = getDb();
const [entry] = await db
  .select()
  .from(arrearsEntries)
  .where(eq(arrearsEntries.externalCode, '00185'))
  .limit(1);
if (!entry) throw new Error('훈테크 00185 없음');

const existing = await listLetterLines(entry.id);
const openBefore = letterBalanceFromLines(existing);
console.log('before lines', existing.length, 'open', openBefore, 'bal', entry.balance);

const hasJuly = existing.some(l => {
  const d = String(l.description || '').replace(/\s+/g, '');
  return /2026년7월|26년7월|7월기장/.test(d) && Math.round(l.amount) === 110000;
});

const next = existing.map(l => ({
  description: /^26년\s*8월/.test(String(l.description || '').trim())
    ? '2026년 8월'
    : /^26년\s*개인조정/.test(String(l.description || '').trim())
      ? '2026년 개인조정료'
      : l.description,
  amount: l.amount,
  paidAmount: l.paidAmount,
  paidDate: l.paidDate,
  source: l.source,
}));

if (!hasJuly) {
  const augIdx = next.findIndex(l => {
    const d = String(l.description || '').replace(/\s+/g, '');
    return /2026년8월|26년8월/.test(d) && Math.round(l.amount) === 110000;
  });
  const julyLine = {
    description: '2026년 7월',
    amount: 110000,
    paidAmount: 110000,
    paidDate: '8월 25일',
    source: 'ledger',
  };
  if (augIdx >= 0) next.splice(augIdx, 0, julyLine);
  else next.push(julyLine);
  console.log('inserted July before', augIdx >= 0 ? next[augIdx + 1]?.description : 'end');
} else {
  console.log('July already present — descriptions only normalized');
}

const openAfter = letterBalanceFromLines(next);
console.log('after lines', next.length, 'open', openAfter);

if (openAfter !== Math.round(entry.balance)) {
  throw new Error(`잔액 불일치 open=${openAfter} bal=${entry.balance}`);
}

await replaceLetterLines(entry.id, 'fix-hoontech-july', next, { syncBalance: false });
const saved = await listLetterLines(entry.id);
console.log(
  'saved tail',
  saved.slice(-5).map(l => `${l.description}|${l.amount}|${l.paidAmount}|${l.paidDate}`),
);
process.exit(0);
