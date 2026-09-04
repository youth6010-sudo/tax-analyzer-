 * 01418 천돈가(윤삼식): 양수도 줄 복구 + 잘못 넣은 2025 7·8월 제거
 * 공문 잔액 = Σ(금액−지급). 현황표와 달라도 정상.
 * node --import tsx scripts/restore-cheondonga-yangsudo.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

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

import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import { letterBalanceFromLines } from '../app/types/arrears.ts';

const CODE = '01418';
const YANG = {
  description: '천돈가 양수도',
  amount: 4664000,
  paidAmount: 0,
  paidDate: '',
  source: 'letter',
};

const db = getDb();
const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
if (!e) throw new Error('not found');
const lines = await listLetterLines(e.id);

const cleaned = lines.filter(l => {
  const d = (l.description || '').replace(/\s+/g, '');
  // 이전에 맞추려고 넣은 7·8월 제거
  if (/2025년7월|2025년8월/.test(d) && l.source === 'ledger') return false;
  return true;
});

const hasYang = cleaned.some(l => (l.description || '').replace(/\s+/g, '') === '천돈가양수도');
const next = [
  ...(hasYang ? [] : [YANG]),
  ...cleaned.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source,
  })),
];
// 양수도가 맨 앞이어야 함
const yangIdx = next.findIndex(l => (l.description || '').replace(/\s+/g, '') === '천돈가양수도');
if (yangIdx > 0) {
  const [y] = next.splice(yangIdx, 1);
  next.unshift(y);
}

await replaceLetterLines(e.id, 'restore-yangsudo', next, { syncBalance: false });
const after = await listLetterLines(e.id);
console.log({
  bal: e.balance,
  open: letterBalanceFromLines(after),
  first: after[0]?.description,
  lines: after.length,
  note: '미수 수수료 = Σ(금액−지급). 현황표와 달라도 정상.',
});
