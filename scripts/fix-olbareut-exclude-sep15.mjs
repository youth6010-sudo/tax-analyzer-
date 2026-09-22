/**
 * 올바릇: 9/15 24.2만 입금 제거 → 현황과 차이(불일치)
 * node --import tsx scripts/fix-olbareut-exclude-sep15.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

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

import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import { letterBalanceFromLines } from '../app/types/arrears.ts';
import { letterOpenForStatusMatch } from '../lib/arrearsLetterOpen.ts';

const db = getDb();
const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, '01206')).limit(1);
if (!e) throw new Error('01206 not found');

const before = await listLetterLines(e.id);
const next = before
  .filter(l => {
    const pay = Math.round(l.paidAmount || 0);
    const pd = String(l.paidDate || '').replace(/\s+/g, '');
    const desc = String(l.description || '').trim();
    // 9/15 24.2만 입금(내역 공란) 제외
    if (!desc && pay === 242000 && /9월15/.test(pd)) return false;
    return true;
  })
  .map(l => ({
    description: l.description || '',
    amount: l.amount,
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source,
  }));

const bal = Math.round(e.balance);
const openBefore = letterBalanceFromLines(before);
const openAfter = letterBalanceFromLines(next);
console.log('lines', before.length, '→', next.length);
console.log('bal', bal, 'open', openBefore, '→', openAfter, 'diff', bal - openAfter);

if (APPLY) {
  await replaceLetterLines(e.id, 'fix-olbareut-exclude-sep15', next, {
    syncBalance: false,
    skipMonthPaymentMerge: true,
  });

  // 패치에서 sep15 재삽입 규칙 제거
  const patchesPath = path.join(root, 'data/arrears-frozen-letter-patches.json');
  const patches = JSON.parse(fs.readFileSync(patchesPath, 'utf8'));
  if (patches.codes?.['01206']?.rules) {
    patches.codes['01206'].rules = patches.codes['01206'].rules.filter(r => r.id !== 'sep15-242k');
    patches.codes['01206'].note =
      '기장 미수 없음. 9/15 24.2만은 공문에서 제외·현황과 불일치 유지. 7/31 300만은 유지.';
    fs.writeFileSync(patchesPath, JSON.stringify(patches, null, 2) + '\n', 'utf8');
    console.log('patches: removed sep15-242k rule');
  }

  // 스냅샷 해당 코드 갱신
  const snapPath = path.join(root, 'data/arrears-frozen-letter-lines.json');
  if (fs.existsSync(snapPath)) {
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    if (snap.codes?.['01206']) {
      snap.codes['01206'] = {
        name: e.companyName,
        balance: bal,
        open: openAfter,
        kind: 'complex',
        lines: next,
      };
      fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2), 'utf8');
      console.log('snapshot 01206 updated');
    }
  }

  const verify = await listLetterLines(e.id);
  console.log(
    'VERIFY open',
    letterBalanceFromLines(verify),
    'statusOpen',
    letterOpenForStatusMatch('01206', verify),
    'diff',
    bal - letterBalanceFromLines(verify),
  );
}

console.log(APPLY ? 'APPLIED' : 'DRY-RUN (pass --apply)');
process.exit(0);
