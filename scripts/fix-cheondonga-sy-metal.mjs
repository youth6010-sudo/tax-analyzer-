/**
 * 천돈가 01418: 현황표 잔액 복구 + 26년 7·8월 기장/기타 추가
 * 에스와이메탈 00176: 선수금 대체를 수수료보다 앞(맨 앞)으로
 * node --import tsx scripts/fix-cheondonga-sy-metal.mjs
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

const db = getDb();
const STATUS_01418 = 4_235_000;

function norm(d) {
  return String(d || '').replace(/\s+/g, '');
}

// --- 천돈가(윤삼식) ---
{
  const CODE = '01418';
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  if (!e) throw new Error(`${CODE} not found`);
  const lines = await listLetterLines(e.id);

  const julAug = [
    { description: '2026년 7월 기장료', amount: 165000, paidAmount: 0, paidDate: '', source: 'ledger' },
    { description: '2026년 7월 기타수수료', amount: 55000, paidAmount: 0, paidDate: '', source: 'ledger' },
    { description: '2026년 8월 기장료', amount: 165000, paidAmount: 0, paidDate: '', source: 'ledger' },
    { description: '2026년 8월 기타수수료', amount: 55000, paidAmount: 0, paidDate: '', source: 'ledger' },
  ];

  const kept = lines.filter(l => {
    const d = norm(l.description);
    // 잘못 넣었던 2025 7·8월은 제외, 2026 7·8은 아래에서 통일 추가
    if (/2025년7월|2025년8월/.test(d) && l.source === 'ledger') return false;
    if (/2026년7월|2026년8월|26년7월|26년8월/.test(d)) return false;
    return true;
  });

  const next = [
    ...kept.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    })),
    ...julAug,
  ];

  console.log(`[${CODE}] open ${letterBalanceFromLines(lines)} → ${letterBalanceFromLines(next)}`);
  console.log(`[${CODE}] bal ${e.balance} → ${STATUS_01418} (현황표)`);

  await replaceLetterLines(e.id, 'fix-cheondonga-jul-aug', next, { syncBalance: false });
  await db
    .update(arrearsEntries)
    .set({
      balance: STATUS_01418,
      source: 'status',
      updatedBy: 'fix-cheondonga-jul-aug',
      updatedAt: new Date(),
    })
    .where(eq(arrearsEntries.id, e.id));

  const afterLines = await listLetterLines(e.id);
  const [after] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  console.log(
    `[${CODE}] done bal=${after.balance} open=${letterBalanceFromLines(afterLines)} diff=${after.balance - letterBalanceFromLines(afterLines)}`,
  );
  afterLines.slice(-6).forEach(l => console.log(' ', l.description, l.amount, l.source));
}

// --- 에스와이메탈: 선수금 대체 → 맨 앞 ---
{
  const CODE = '00176';
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  if (!e) throw new Error(`${CODE} not found`);
  const lines = await listLetterLines(e.id);

  const advance = lines.filter(l => /선수금/.test(l.description || ''));
  const rest = lines.filter(l => !/선수금/.test(l.description || ''));
  if (!advance.length) {
    console.log(`[${CODE}] no 선수금 line — skip reorder`);
  } else {
    const next = [...advance, ...rest].map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    }));
    console.log(`[${CODE}] reorder: 선수금 first, then ${rest.length} fees`);
    await replaceLetterLines(e.id, 'fix-sy-advance-order', next, { syncBalance: false });
    const after = await listLetterLines(e.id);
    after.forEach((l, i) => console.log(i, l.description, l.amount, l.paidAmount, l.source));
    console.log(`[${CODE}] bal=${e.balance} open=${letterBalanceFromLines(after)}`);
  }
}
