/**
 * 더푸른 00165: 부가세신고수수료 3건 중 1건만 반영 → 2건(55k×2) 보강
 * 올인원 01671: 자동출금·차월결제 월기장/입금은 상세에서 제외 (개인조정료만)
 *
 * node --import tsx scripts/fix-deopureun-allinone.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APPLY = process.argv.includes('--apply');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import { letterBalanceFromLines } from '../app/types/arrears.ts';

const db = getDb();

async function fixDeopureun() {
  const CODE = '00165';
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE))
    .limit(1);
  if (!e) throw new Error('더푸른 not found');

  const lines = await listLetterLines(e.id);
  const next = lines.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source,
  }));

  const vatIdx = next.findIndex(
    l => /부가세신고/.test(String(l.description || '').replace(/\s+/g, '')) && Math.round(l.amount) === 55_000,
  );
  if (vatIdx < 0) throw new Error('더푸른: 26년 부가세신고 55k 줄 없음');

  // 이미 55k 부가세신고가 3개면 스킵
  const vat55 = next.filter(
    l => /부가세신고/.test(String(l.description || '').replace(/\s+/g, '')) && Math.round(l.amount) === 55_000,
  );
  if (vat55.length >= 3) {
    console.log('더푸른: 이미 부가세신고 55k ×', vat55.length);
  } else {
    const need = 3 - vat55.length;
    const insertAt = vatIdx + 1;
    for (let i = 0; i < need; i++) {
      next.splice(insertAt + i, 0, {
        description: '26년 부가세신고',
        amount: 55_000,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      });
    }
    console.log(`더푸른: 부가세신고 55k ×${need} 추가 (총 3건)`);
  }

  const open = letterBalanceFromLines(next);
  console.log('더푸른 bal', e.balance, 'open', open, 'diff', Math.round(e.balance) - open);
  if (APPLY) {
    await replaceLetterLines(e.id, 'fix-deopureun-vat3', next, { syncBalance: false });
  }
}

async function fixAllinone() {
  const CODE = '01671';
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE))
    .limit(1);
  if (!e) throw new Error('올인원 not found');

  const lines = await listLetterLines(e.id);
  // 개인조정료(letter)만 유지 — 자동출금 월기장·입금 제외
  const next = lines
    .filter(l => {
      const d = String(l.description || '').replace(/\s+/g, '');
      if (l.source === 'payment') return false;
      if (l.source === 'ledger' && /\d{1,2}월|기장/.test(d)) return false;
      return true;
    })
    .map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    }));

  const open = letterBalanceFromLines(next);
  console.log(
    '올인원 bal',
    e.balance,
    'open',
    open,
    'diff',
    Math.round(e.balance) - open,
    '(차월결제 11만은 상세 미표시·정상)',
  );
  console.log(
    '올인원 lines',
    next.map(l => `${l.description}=${l.amount}`).join(' | '),
  );
  if (APPLY) {
    await replaceLetterLines(e.id, 'fix-allinone-autodebit', next, { syncBalance: false });
  }
}

await fixDeopureun();
await fixAllinone();
console.log(APPLY ? 'APPLIED' : 'DRY-RUN — re-run with --apply');
