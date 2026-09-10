/**
 * 6곳 복구본 정리: 2026-07/08 줄을 6월 뒤·8월 앞으로, 빌프랑 7월 입금 병합
 * node --import tsx scripts/fix-unpaid-bk-monthly-gaps-order.mjs
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
const { listLetterLines, replaceLetterLines } = await import(
  '../lib/arrearsLetterDb.ts'
);
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');

const CODES = ['00242', '00659', '00942', '01070', '01205', '01213'];

function compact(s) {
  return String(s || '').replace(/\s+/g, '');
}

function ymFromDesc(desc) {
  const d = compact(desc);
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[2])).padStart(2, '0')}`;
}

function is2026July(l) {
  return ymFromDesc(l.description) === '2026-07' && Math.round(l.amount) > 0;
}
function is2026Aug(l) {
  return ymFromDesc(l.description) === '2026-08' && Math.round(l.amount) > 0;
}

const db = getDb();

for (const code of CODES) {
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, code))
    .limit(1);
  if (!e) continue;
  let lines = (await listLetterLines(e.id)).map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source,
  }));

  // 빌프랑: 7/30 입금 + 미납 7월 → 한 줄로
  if (code === '00242') {
    const payIdx = lines.findIndex(
      l =>
        Math.round(l.amount) === 0 &&
        Math.round(l.paidAmount) === 110000 &&
        compact(l.paidDate) === '7월30일',
    );
    const julIdx = lines.findIndex(
      l => is2026July(l) && Math.round(l.paidAmount) === 0,
    );
    if (payIdx >= 0 && julIdx >= 0) {
      lines[julIdx] = {
        ...lines[julIdx],
        description: '2026년 7월',
        paidAmount: 110000,
        paidDate: '7월 30일',
        source: 'ledger',
      };
      lines.splice(payIdx, 1);
    }
    // 8월은 이미 8/31 지급으로 정리됐을 것
  }

  // 2026-07 청구 줄 뽑아서 올바른 위치로
  const julyLines = lines.filter(is2026July);
  const rest = lines.filter(l => !is2026July(l));

  // insert after last line that is 2026-06 month fee or 개인조정 before 2026-08,
  // prefer: after 2026-06, else before 2026-08, else end
  let insertAt = rest.length;
  const jun26 = rest.map((l, i) => (ymFromDesc(l.description) === '2026-06' ? i : -1)).filter(i => i >= 0);
  const aug26 = rest.findIndex(is2026Aug);
  if (jun26.length) insertAt = Math.max(...jun26) + 1;
  else if (aug26 >= 0) insertAt = aug26;

  // 조정료가 6월 뒤에 있으면 그 뒤?
  // 다함/33카페: 개인조정 후 6월 — 7월은 6월 뒤가 맞음
  const next = [
    ...rest.slice(0, insertAt),
    ...julyLines.map(l => ({
      ...l,
      description: '2026년 7월',
    })),
    ...rest.slice(insertAt),
  ];

  // 중복 7월 제거 (동일 금액)
  const seenJul = new Set();
  const deduped = next.filter(l => {
    if (!is2026July(l)) return true;
    const k = `${Math.round(l.amount)}|${Math.round(l.paidAmount)}|${compact(l.paidDate)}`;
    if (seenJul.has(k)) return false;
    seenJul.add(k);
    return true;
  });

  const open = letterBalanceFromLines(deduped);
  const bal = Math.round(e.balance);
  console.log(
    code,
    e.companyName,
    'open',
    open,
    'bal',
    bal,
    'july',
    deduped.filter(is2026July).map(l => `${l.amount}/${l.paidAmount}/${l.paidDate}`),
  );
  if (open !== bal) {
    console.error('SKIP balance mismatch', code);
    continue;
  }

  await replaceLetterLines(e.id, 'fix-unpaid-bk-order', deduped, {
    syncBalance: false,
  });
  const saved = await listLetterLines(e.id);
  console.log(
    '  tail',
    saved.slice(-5).map(l => `${l.description}|${l.amount}|${l.paidAmount}|${l.paidDate || ''}`),
  );
}

process.exit(0);
