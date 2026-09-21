/**
 * 1) 오프라인 공문 복구
 * 2) 오늘 확정분 스냅샷
 * 3) 기장료만(simple) vs 복잡미수(complex) 분류 → complex 동결 코드 목록
 * node --import tsx scripts/freeze-today-arrears-letters.mjs [--apply]
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
import {
  classifyArrearsLetterComplexity,
} from '../lib/arrearsLetterComplexity.ts';
import {
  ARREARS_LETTER_CONTENT_FROZEN_CODES,
  ARREARS_LETTER_PROTECTED_CODES,
  ARREARS_SKIP_CLIENT_DETAIL_CODES,
} from '../lib/arrearsBalanceLock.ts';

const db = getDb();

/** 오프라인 고정 공문 (엑셀 원문) */
const OFFLINE_LINES = [
  { description: '2020년 5월 조정수수료', amount: 605000, paidAmount: 605000, paidDate: '', source: 'letter' },
  { description: '2021년 5월 조정수수료', amount: 694999, paidAmount: 195000, paidDate: '', source: 'letter' },
  { description: '2022년 5월 조정수수료', amount: 825000, paidAmount: 0, paidDate: '', source: 'letter' },
  { description: '2023년 5월 조정수수료', amount: 770000, paidAmount: 0, paidDate: '', source: 'letter' },
  { description: '2023년 6월 기장료', amount: 110000, paidAmount: 0, paidDate: '', source: 'letter' },
  { description: '', amount: 0, paidAmount: 1000000, paidDate: '', source: 'letter' },
  { description: '', amount: 0, paidAmount: 110000, paidDate: '', source: 'letter' },
];

function toInput(l) {
  return {
    description: l.description || '',
    amount: Math.round(l.amount || 0),
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  };
}

// 1) 오프라인 복구
const [offline] = await db
  .select()
  .from(arrearsEntries)
  .where(eq(arrearsEntries.externalCode, '00183'))
  .limit(1);
if (!offline) throw new Error('00183 not found');
const offlineBefore = await listLetterLines(offline.id);
console.log('오프라인 before lines=', offlineBefore.length, 'bal=', offline.balance);
if (APPLY || offlineBefore.length === 0) {
  if (APPLY) {
    await replaceLetterLines(offline.id, 'inactive-arrears-seed', OFFLINE_LINES, {
      syncBalance: false,
    });
  }
  console.log(
    APPLY ? '오프라인 RESTORED' : '오프라인 would restore',
    'open=',
    letterBalanceFromLines(OFFLINE_LINES),
  );
}

const all = await db.select().from(arrearsEntries);
const snapshot = {
  asOf: '2026.09.21',
  note: '오늘 확정 공문. complex=동결(9월~만 추가). simple_bk=기장료만(업로드 시 월 롤링 허용).',
  codes: {},
};
const simpleCodes = [];
const complexCodes = [];
const emptyCodes = [];

for (const e of all) {
  let lines = (await listLetterLines(e.id)).map(toInput);
  if (e.externalCode === '00183' && lines.length === 0) {
    lines = OFFLINE_LINES.map(toInput);
  }
  const open = letterBalanceFromLines(lines);
  const bal = Math.round(e.balance);
  const kind = classifyArrearsLetterComplexity(lines, bal);
  snapshot.codes[e.externalCode] = {
    name: e.companyName,
    balance: bal,
    open,
    kind,
    lines,
  };
  if (kind === 'simple_bk') simpleCodes.push(e.externalCode);
  else if (kind === 'complex') complexCodes.push(e.externalCode);
  else emptyCodes.push(e.externalCode);
}

// 기존 수동 동결·보호 코드는 무조건 complex 동결에 포함
const alwaysFrozen = new Set([
  ...ARREARS_LETTER_CONTENT_FROZEN_CODES,
  ...ARREARS_LETTER_PROTECTED_CODES,
  ...ARREARS_SKIP_CLIENT_DETAIL_CODES,
]);
for (const code of alwaysFrozen) {
  if (!complexCodes.includes(code)) complexCodes.push(code);
  const i = simpleCodes.indexOf(code);
  if (i >= 0) simpleCodes.splice(i, 1);
}

const frozenList = {
  asOf: '2026.09.21',
  note: '복잡미수·보호·수동확정 — 업로드 시 고정값 유지 + 9월~만 추가. 기장료만(simple_bk)은 제외.',
  codes: [...new Set(complexCodes)].sort(),
  simpleBkCodes: [...new Set(simpleCodes)].sort(),
};

fs.writeFileSync(
  path.join(root, 'data/arrears-frozen-letter-lines.json'),
  JSON.stringify(snapshot, null, 2),
  'utf8',
);
fs.writeFileSync(
  path.join(root, 'data/arrears-content-frozen-codes.json'),
  JSON.stringify(frozenList, null, 2),
  'utf8',
);

console.log('\nsimple_bk', simpleCodes.length, simpleCodes.slice(0, 20).join(','), '...');
console.log('complex', complexCodes.length);
console.log('empty', emptyCodes.length);
console.log('snapshot → data/arrears-frozen-letter-lines.json');
console.log('frozen codes → data/arrears-content-frozen-codes.json');

// patches에 오프라인 스냅샷 규칙 보강
const patchesPath = path.join(root, 'data/arrears-frozen-letter-patches.json');
const patches = JSON.parse(fs.readFileSync(patchesPath, 'utf8'));
patches.asOf = '2026.09.21';
patches.codes = patches.codes || {};
patches.codes['00183'] = {
  name: '오프라인',
  snapshotOnly: true,
  note: '잔액0·공문 고정. 거래처별 반영 제외(LETTER_PROTECTED).',
  lines: OFFLINE_LINES,
};
if (APPLY) {
  fs.writeFileSync(patchesPath, JSON.stringify(patches, null, 2) + '\n', 'utf8');
  console.log('patches updated with 00183');
}

process.exit(0);
