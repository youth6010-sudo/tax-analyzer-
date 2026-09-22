/**
 * 다함·아이스테이션·기타수수료·태평푸드·해밀한의원 공문 일괄 보정
 * node --import tsx scripts/fix-batch-pay-attach-haemil.mjs [--apply]
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
import { formatArrearsReasonSummary } from '../lib/arrearsReasonSummary.ts';

const db = getDb();

function toInput(l) {
  return {
    description: l.description || '',
    amount: Math.round(l.amount || 0),
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  };
}

function norm(d) {
  return String(d || '').replace(/\s+/g, '');
}

async function applyFix(code, name, build) {
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1);
  if (!e) throw new Error(`${code} ${name} not found`);
  const before = await listLetterLines(e.id);
  const next = build(before.map(toInput));
  const bal = Math.round(e.balance);
  const beforeOpen = letterBalanceFromLines(before);
  const afterOpen = letterBalanceFromLines(next);
  const reason = formatArrearsReasonSummary(next, { asOfDate: e.asOfDate || e.letterDate });
  console.log(
    code,
    name,
    `n ${before.length}→${next.length}`,
    `open ${beforeOpen}→${afterOpen}`,
    `bal ${bal}`,
    afterOpen === bal ? 'MATCH' : `diff ${bal - afterOpen}`,
    `| 사유: ${reason}`,
  );
  if (APPLY) {
    await replaceLetterLines(e.id, 'fix-batch-pay-attach-haemil', next, { syncBalance: false });
  }
  return { code, name, bal, beforeOpen, afterOpen, match: afterOpen === bal, reason, next };
}

/** 지급-only를 앞쪽 미수 청구에 FIFO/동액으로 붙이고 지급줄 제거 */
function attachPaymentOnlyFifo(lines) {
  const out = lines.map(l => ({ ...l }));
  const remove = new Set();

  for (let i = 0; i < out.length; i++) {
    const pay = out[i];
    const amt = Math.round(pay.amount || 0);
    const paid = Math.round(pay.paidAmount || 0);
    if (paid <= 0 || amt !== 0) continue;

    let remain = paid;
    const pd = pay.paidDate || '';

    // 동액 우선
    for (let j = 0; j < i && remain > 0; j++) {
      if (remove.has(j)) continue;
      const ch = out[j];
      const open = Math.round(ch.amount || 0) - Math.round(ch.paidAmount || 0);
      if (open <= 0 || Math.round(ch.amount || 0) <= 0) continue;
      if (open === remain || Math.round(ch.amount) === remain) {
        const use = Math.min(open, remain);
        out[j] = {
          ...ch,
          paidAmount: Math.round(ch.paidAmount || 0) + use,
          paidDate: ch.paidDate || pd,
        };
        remain -= use;
      }
    }
    // FIFO
    for (let j = 0; j < i && remain > 0; j++) {
      if (remove.has(j)) continue;
      const ch = out[j];
      const open = Math.round(ch.amount || 0) - Math.round(ch.paidAmount || 0);
      if (open <= 0 || Math.round(ch.amount || 0) <= 0) continue;
      const use = Math.min(open, remain);
      out[j] = {
        ...ch,
        paidAmount: Math.round(ch.paidAmount || 0) + use,
        paidDate: ch.paidDate || pd,
      };
      remain -= use;
    }

    if (remain === 0) remove.add(i);
    else {
      out[i] = { ...pay, paidAmount: remain };
    }
  }

  return out.filter((_, idx) => !remove.has(idx));
}

/** 특정 지급-only를 지정 월 줄에 붙임 (부분지급 허용, paid>amount 허용) */
function attachPayToMonth(lines, { payPred, monthPred, paidAmount, paidDate }) {
  const out = lines.map(l => ({ ...l }));
  let payIdx = -1;
  for (let i = 0; i < out.length; i++) {
    if (payPred(out[i])) {
      payIdx = i;
      break;
    }
  }
  if (payIdx < 0) return out;

  let monthIdx = -1;
  for (let i = 0; i < out.length; i++) {
    if (i === payIdx) continue;
    if (monthPred(out[i])) {
      monthIdx = i;
      break;
    }
  }
  if (monthIdx < 0) return out;

  const pay = out[payIdx];
  const use = paidAmount ?? Math.round(pay.paidAmount || 0);
  const pd = paidDate ?? pay.paidDate ?? '';
  out[monthIdx] = {
    ...out[monthIdx],
    paidAmount: use,
    paidDate: pd,
  };
  out.splice(payIdx, 1);
  return out;
}

const report = [];

// ── 1) 다함: 7월↔8월 지급일 당월로 교정 ──
report.push(
  await applyFix('01070', '주식회사 다함', lines => {
    return lines.map(l => {
      const d = norm(l.description);
      if (d === '2026년7월' || d === '26년7월') {
        return { ...l, paidAmount: 143000, paidDate: '7월 27일' };
      }
      if (d === '2026년8월' || d === '26년8월') {
        return { ...l, paidAmount: 143000, paidDate: '8월 25일' };
      }
      return l;
    });
  }),
);

// ── 2) 아이스테이션: 8/14→7월, 8/31→8월 ──
report.push(
  await applyFix('00180', '아이스테이션', lines => {
    let next = attachPayToMonth(lines, {
      payPred: l =>
        Math.round(l.amount || 0) === 0 &&
        Math.round(l.paidAmount || 0) === 100000 &&
        /8월\s*14일/.test(String(l.paidDate || '')),
      monthPred: l => /^2026년\s*7월$/.test(norm(l.description)) || norm(l.description) === '2026년7월',
      paidAmount: 100000,
      paidDate: '8월 14일',
    });
    next = attachPayToMonth(next, {
      payPred: l =>
        Math.round(l.amount || 0) === 0 &&
        Math.round(l.paidAmount || 0) === 200000 &&
        /8월\s*31일/.test(String(l.paidDate || '')),
      monthPred: l => /^2026년\s*8월$/.test(norm(l.description)) || norm(l.description) === '2026년8월',
      paidAmount: 200000,
      paidDate: '8월 31일',
    });
    return next;
  }),
);

// ── 3) 벳케어·프랭크·신진·깨끗: 지급-only → 앞 미수에 부착 ──
for (const [code, name] of [
  ['00647', '벳케어동물센터'],
  ['01972', '프랭크버거 일광신도시점'],
  ['00149', '(주)신진'],
  ['01812', '주식회사 깨끗'],
]) {
  report.push(await applyFix(code, name, attachPaymentOnlyFifo));
}

// ── 4) 태평푸드: 8/31 → 소급기장료, 8월만 미수 ──
report.push(
  await applyFix('02184', '태평푸드', lines => {
    return lines
      .map(l => {
        const d = norm(l.description);
        if (/소급/.test(d)) {
          return { ...l, amount: 110000, paidAmount: 110000, paidDate: '8월 31일', source: 'letter' };
        }
        if (/2026년8월|26년8월/.test(d)) {
          return { ...l, amount: 110000, paidAmount: 0, paidDate: '', source: 'letter' };
        }
        // 지급-only / 태평푸드(30) 제거
        if (Math.round(l.amount || 0) === 0 && Math.round(l.paidAmount || 0) > 0) {
          return null;
        }
        return l;
      })
      .filter(Boolean);
  }),
);

// ── 5) 해밀한의원: 첨부 공문 내역으로 교체 ──
const haemilLines = buildHaemilLetter();
report.push(
  await applyFix('00162', '해밀한의원', () => haemilLines),
);

function buildHaemilLetter() {
  /** @type {{description:string,amount:number,paidAmount:number,paidDate:string,source:string}[]} */
  const rows = [];
  const add = (description, amount, paidAmount, paidDate) => {
    rows.push({
      description,
      amount,
      paidAmount,
      paidDate: paidDate || '',
      source: 'letter',
    });
  };

  // 20년 8월 ~ 21년 5월 (완납)
  const early = [
    ['20년 8월', '08월 24일'],
    ['20년 9월', '09월 25일'],
    ['20년 10월', '10월 22일'],
    ['20년 11월', '11월 23일'],
    ['20년 12월', '12월 23일'],
    ['21년 1월', '01월 22일'],
    ['21년 2월', '02월 24일'],
    ['21년 3월', '04월 05일'],
    ['21년 4월', '05월 06일'],
    ['21년 5월', '06월 03일'],
  ];
  for (const [d, pd] of early) add(d, 110000, 110000, pd);

  add('21년 조정수수료', 770000, 0, '');

  const mid21 = [
    ['21년 6월', '07월 05일'],
    ['21년 7월', '08월 03일'],
    ['21년 8월', '09월 03일'],
    ['21년 9월', '10월 05일'],
    ['21년 10월', '11월 03일'],
    ['21년 11월', '12월 03일'],
    ['21년 12월', '01월 05일'],
    ['22년 1월', '02월 07일'],
    ['22년 2월', '03월 04일'],
    ['22년 3월', '04월 04일'],
    ['22년 4월', '05월 04일'],
    ['22년 5월', '06월 07일'],
  ];
  for (const [d, pd] of mid21) add(d, 110000, 110000, pd);

  add('22년 조정수수료', 1100000, 0, '');

  const mid22 = [
    ['22년 6월', '07월 04일'],
    ['22년 7월', '08월 03일'],
    ['22년 8월', '09월 05일'],
    ['22년 9월', '10월 06일'],
    ['22년 10월', '11월 03일'],
    ['22년 11월', '12월 07일'],
    ['22년 12월', '12월 01일'],
  ];
  for (const [d, pd] of mid22) add(d, 110000, 110000, pd);

  add('23년 1월', 110000, 110000, '01월 04일');
  add('23년 2월', 110000, 110000, '02월 03일');
  // 23년 3·4월: 청구 없이 조정미수 일부 회수
  add('23년 3월', 0, 110000, '03월 06일');
  add('23년 4월', 0, 110000, '04월 05일');

  return rows;
}

fs.writeFileSync(
  path.join(root, 'data/_fix-batch-pay-attach-haemil.json'),
  JSON.stringify({ at: new Date().toISOString(), apply: APPLY, report }, null, 2),
);
console.log(APPLY ? 'APPLIED' : 'DRY-RUN — re-run with --apply');
