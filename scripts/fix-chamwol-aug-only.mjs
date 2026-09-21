/**
 * 차월결제 5곳 — 리얼그로우와 같이 7월은 8월 입금으로 청산, 8월 기장(·기타)만 미수.
 * node --import tsx scripts/fix-chamwol-aug-only.mjs [--apply]
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
import { letterBalanceFromLines, linesForCurrentLetterCycle } from '../app/types/arrears.ts';

const db = getDb();

/** 차월: 7월분 + 8월 입금(7월 회수) + 8월 미수(기장·기타) */
const TARGETS = [
  {
    code: '01869',
    name: '주식회사 비포인트디자인그룹',
    jul: [{ description: '2026년 7월', amount: 220000 }],
    pay: { description: '(주)비포인트디자인그룹(28)', paidAmount: 220000, paidDate: '8월 28일' },
    aug: [{ description: '2026년 8월', amount: 220000 }],
  },
  {
    code: '01813',
    name: '도리당 광안점',
    jul: [
      { description: '2026년 7월', amount: 121000 },
      { description: '2026년 기타수수료 7월', amount: 55000 },
    ],
    pay: { description: '도리당광안점(25)', paidAmount: 176000, paidDate: '8월 25일' },
    aug: [
      { description: '2026년 8월', amount: 121000 },
      { description: '2026년 기타수수료 8월', amount: 55000 },
    ],
  },
  {
    code: '01673',
    name: '(주)올인원이엔씨',
    jul: [{ description: '2026년 7월', amount: 165000 }],
    pay: { description: '주식회사CFSKOREA(30)', paidAmount: 165000, paidDate: '8월 31일' },
    aug: [{ description: '2026년 8월', amount: 165000 }],
  },
  {
    code: '01210',
    name: '연합건기',
    jul: [{ description: '2026년 7월', amount: 110000 }],
    pay: { description: '연합건기(곽창운)(28)', paidAmount: 110000, paidDate: '8월 28일' },
    aug: [{ description: '2026년 8월', amount: 110000 }],
  },
  {
    code: '01990',
    name: '빌리언웨이브(Billion Wave)',
    jul: [{ description: '2026년 7월', amount: 99000 }],
    pay: { description: '빌리언웨이브(30)', paidAmount: 99000, paidDate: '8월 31일' },
    aug: [{ description: '2026년 8월', amount: 99000 }],
  },
];

function buildLines(t) {
  return [
    ...t.jul.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: 0,
      paidDate: '',
      source: 'ledger',
    })),
    {
      description: t.pay.description,
      amount: 0,
      paidAmount: t.pay.paidAmount,
      paidDate: t.pay.paidDate,
      source: 'payment',
    },
    ...t.aug.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: 0,
      paidDate: '',
      source: 'ledger',
    })),
  ];
}

const report = [];

for (const t of TARGETS) {
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, t.code)).limit(1);
  if (!e) throw new Error(`not found ${t.code} ${t.name}`);

  const before = await listLetterLines(e.id);
  const next = buildLines(t);
  const bal = Math.round(e.balance);
  const beforeOpen = letterBalanceFromLines(before);
  const afterOpen = letterBalanceFromLines(next);
  const cycle = linesForCurrentLetterCycle(next);
  const cycleOpen = letterBalanceFromLines(cycle);
  const row = {
    code: t.code,
    name: e.companyName,
    bal,
    beforeOpen,
    afterOpen,
    match: afterOpen === bal,
    cycleDescs: cycle.map(l => l.description),
    cycleOpen,
    cycleMatch: cycleOpen === bal,
  };
  report.push(row);
  console.log(
    t.code,
    e.companyName,
    `open ${beforeOpen}→${afterOpen}`,
    `bal ${bal}`,
    afterOpen === bal ? 'MATCH' : `DIFF ${bal - afterOpen}`,
    `| cycle: ${cycle.map(l => l.description).join(' / ')}`,
  );

  if (APPLY) {
    await replaceLetterLines(e.id, 'fix-chamwol-aug-only', next, { syncBalance: false });
  }
}

const out = path.join(root, 'data/_fix-chamwol-aug-only.json');
fs.writeFileSync(out, JSON.stringify({ apply: APPLY, report }, null, 2));
console.log(APPLY ? 'APPLIED' : 'DRY-RUN', '→', out);
process.exit(report.every(r => r.match && r.cycleMatch) ? 0 : 1);
