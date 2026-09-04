/**
 * 천돈가 01418: 목록 잔액 = 공문 Σ(금액−지급)
 * 에스와이메탈 00176: 기존 공문만 유지 (26년 7·8월 ledger/즉시입금 제거)
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

// --- 천돈가(윤삼식) ---
{
  const CODE = '01418';
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  if (!e) throw new Error(`${CODE} not found`);
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  console.log(`[${CODE}] bal ${e.balance} → ${open} (letter open)`);
  await replaceLetterLines(
    e.id,
    'fix-cheondonga-letter-bal',
    lines.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    })),
    { syncBalance: true },
  );
  const [after] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  console.log(`[${CODE}] done bal=${after.balance} open=${letterBalanceFromLines(await listLetterLines(e.id))}`);
}

// --- 에스와이메탈 ---
{
  const CODE = '00176';
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  if (!e) throw new Error(`${CODE} not found`);
  const lines = await listLetterLines(e.id);
  const before = letterBalanceFromLines(lines);

  const next = lines.filter(l => l.source === 'letter');

  console.log(`[${CODE}] lines ${lines.length} → ${next.length} open ${before} → ${letterBalanceFromLines(next)}`);
  for (const l of lines) {
    if (l.source !== 'letter') {
      console.log('  drop', l.source, l.amount, l.paidAmount, l.paidDate, l.description);
    }
  }

  await replaceLetterLines(
    e.id,
    'fix-sy-metal-letter-only',
    next.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    })),
    { syncBalance: false },
  );
  const afterLines = await listLetterLines(e.id);
  const [after] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, CODE));
  console.log(`[${CODE}] done bal=${after.balance} open=${letterBalanceFromLines(afterLines)} lines=${afterLines.length}`);
}
