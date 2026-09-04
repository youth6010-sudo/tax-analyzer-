/**
 * 26.07.27 공문 — 내역 빈 지급행을 공문 엑셀과 같은 순서로 맞춘다.
 * (이전에 맨 끝에 붙인 경우 재정렬 + 누락 복구)
 * cutoff 이후 ledger/payment는 공문 뒤에 유지. 월기장=입금 즉시회수는 제외.
 *
 * node --import tsx scripts/restore-missing-blank-pays.mjs [--apply]
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

import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import {
  letterBalanceFromLines,
  formatArrearsPaidDateKo,
} from '../app/types/arrears.ts';
import { parseArrearsLetterWorkbook } from '../lib/arrearsLetterParse.ts';
import { paidDateMatchKey } from '../lib/arrearsLineLabel.ts';
import { isArrearsLetterProtected } from '../lib/arrearsBalanceLock.ts';

function normName(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[＆&]/g, '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사|\(유\)/g, '(유)')
    .replace(/[()（）·・./\-]/g, '')
    .toLowerCase();
}

function findByName(entries, sheetName) {
  const usable = entries.filter(
    e => String(e.companyName || '').trim() && String(e.externalCode || '') !== '00000',
  );
  const key = normName(sheetName);
  const byName = new Map(usable.map(e => [normName(e.companyName), e]));
  let hit = byName.get(key);
  if (hit) return hit;
  for (const [nk, row] of byName) {
    if (nk.includes(key) || key.includes(nk)) return row;
  }
  return null;
}

function payKey(paidAmount, paidDate) {
  return `${Math.round(paidAmount)}|${paidDateMatchKey(paidDate)}`;
}

function descKey(d) {
  return String(d || '').replace(/\s+/g, '');
}

function lineFingerprint(l) {
  return `${descKey(l.description)}|${Math.round(l.amount)}|${Math.round(l.paidAmount)}|${paidDateMatchKey(l.paidDate)}|${l.source || ''}`;
}

/** cutoff 이후 월기장+동일금액 입금(즉시회수)만 제거 */
function stripImmediateMonthlyRecoveries(lines) {
  const n = lines.length;
  const drop = new Set();
  const isMonthCharge = l => {
    if (Math.round(l.amount) <= 0) return false;
    if (l.source === 'letter') return false;
    const d = String(l.description || '').replace(/\s+/g, '');
    return /\d{1,2}월/.test(d);
  };
  const isPayment = l =>
    Math.round(l.paidAmount) > 0 &&
    Math.round(l.amount) === 0 &&
    l.source !== 'letter';

  for (let i = 0; i < n; i++) {
    if (drop.has(i)) continue;
    const l = lines[i];
    const amt = Math.round(l.amount);
    const paid = Math.round(l.paidAmount);
    if (amt > 0 && amt === paid && isMonthCharge(l)) {
      drop.add(i);
      continue;
    }
    if (isMonthCharge(l) && paid === 0) {
      for (let j = i + 1; j < Math.min(i + 5, n); j++) {
        if (drop.has(j)) continue;
        const p = lines[j];
        if (isPayment(p) && Math.round(p.paidAmount) === amt) {
          drop.add(i);
          drop.add(j);
          break;
        }
        if (Math.round(p.amount) > 0) break;
      }
    }
  }
  return lines.filter((_, i) => !drop.has(i));
}

/**
 * 26.07.27 공문 줄 순서를 뼈대로 맞추고, DB의 cutoff 이후 줄은 뒤에 붙인다.
 * 빈 지급행도 엑셀 위치 그대로.
 */
function mergeLetterOrder(excelLines, dbLines) {
  const pool = dbLines.map((l, i) => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source,
    _i: i,
  }));
  const used = new Set();

  const take = pred => {
    const idx = pool.findIndex((l, i) => !used.has(i) && pred(l));
    if (idx < 0) return null;
    used.add(idx);
    const { _i, ...rest } = pool[idx];
    return rest;
  };

  const ordered = [];
  for (const xl of excelLines) {
    const desc = String(xl.description || '').trim();
    const amt = Math.round(xl.amount || 0);
    const paid = Math.round(xl.paidAmount || 0);
    const pdate = formatArrearsPaidDateKo(xl.paidDate) || xl.paidDate || '';

    // 빈 지급행 → 엑셀 순서 고정
    if (!desc && paid > 0) {
      const hit =
        take(
          l =>
            !String(l.description || '').trim() &&
            Math.round(l.paidAmount) === paid &&
            paidDateMatchKey(l.paidDate) === paidDateMatchKey(pdate),
        ) ||
        take(
          l =>
            !String(l.description || '').trim() && Math.round(l.paidAmount) === paid,
        );
      ordered.push(
        hit || {
          description: '',
          amount: 0,
          paidAmount: paid,
          paidDate: pdate,
          source: 'letter',
        },
      );
      continue;
    }

    // 동일 적요+금액(+지급) letter 우선
    let hit =
      take(
        l =>
          l.source === 'letter' &&
          descKey(l.description) === descKey(desc) &&
          Math.round(l.amount) === amt &&
          Math.round(l.paidAmount) === paid,
      ) ||
      take(
        l =>
          l.source === 'letter' &&
          descKey(l.description) === descKey(desc) &&
          Math.round(l.amount) === amt,
      ) ||
      take(l => l.source === 'letter' && descKey(l.description) === descKey(desc));

    if (hit) {
      // 엑셀에 지급이 더 있으면 보강(드묾)
      if (paid > Math.round(hit.paidAmount)) {
        hit = { ...hit, paidAmount: paid, paidDate: pdate || hit.paidDate };
      }
      ordered.push(hit);
    } else {
      ordered.push({
        description: desc,
        amount: amt,
        paidAmount: paid,
        paidDate: pdate,
        source: 'letter',
      });
    }
  }

  // 공문에 없는 DB 잔여(주로 cutoff 이후 ledger/payment). 빈지급 letter는 엑셀에 없으면 버림(중복 방지)
  const extras = [];
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue;
    const l = pool[i];
    if (!String(l.description || '').trim() && Math.round(l.paidAmount) > 0 && l.source === 'letter') {
      continue; // 엑셀에 없는/이미 배치한 빈지급 — 끝에 두지 않음
    }
    const { _i, ...rest } = l;
    extras.push(rest);
  }

  return stripImmediateMonthlyRecoveries([...ordered, ...extras]);
}

function sameOrder(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (lineFingerprint(a[i]) !== lineFingerprint(b[i])) return false;
  }
  return true;
}

const dir = path.join('z:', '10_미수관리', '미수금 공문 - 26년');
const files = fs
  .readdirSync(dir)
  .filter(f => /\.xls[x]?$/i.test(f) && /미수수수료/.test(f) && !f.includes('현황') && /26\.07\.27/.test(f))
  .map(f => path.join(dir, f));

const db = getDb();
const entries = await db.select().from(arrearsEntries);

let changed = 0;
const report = [];

for (const filePath of files) {
  const buf = fs.readFileSync(filePath);
  const { sheets } = parseArrearsLetterWorkbook(buf);

  for (const sh of sheets) {
    const blankPays = sh.lines.filter(
      l => !String(l.description || '').trim() && Math.round(l.paidAmount) > 0,
    );
    if (!blankPays.length) continue;

    const hit = findByName(entries, sh.companyName);
    if (!hit) continue;
    if (isArrearsLetterProtected(hit.externalCode)) continue;

    const dbLines = await listLetterLines(hit.id);
    const merged = mergeLetterOrder(sh.lines, dbLines);
    if (sameOrder(dbLines, merged)) continue;

    const beforeOpen = letterBalanceFromLines(dbLines);
    const afterOpen = letterBalanceFromLines(merged);
    const blankIdx = merged.findIndex(
      l => !String(l.description || '').trim() && Math.round(l.paidAmount) > 0,
    );
    const excelBlankIdx = sh.lines.findIndex(
      l => !String(l.description || '').trim() && Math.round(l.paidAmount) > 0,
    );

    report.push({
      code: hit.externalCode,
      name: hit.companyName,
      bal: hit.balance,
      openBefore: beforeOpen,
      openAfter: afterOpen,
      linesBefore: dbLines.length,
      linesAfter: merged.length,
      excelBlankAt: excelBlankIdx,
      mergedBlankAt: blankIdx,
      sample: merged.slice(0, 6).map(l => ({
        d: l.description || '(빈지급)',
        a: l.amount,
        p: l.paidAmount,
        pd: l.paidDate,
        s: l.source,
      })),
    });

    if (APPLY) {
      await replaceLetterLines(hit.id, 'reorder-blank-pays-letter-order', merged, {
        syncBalance: false,
      });
    }
    changed += 1;
  }
}

console.log(JSON.stringify(report, null, 2));
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'}: reordered ${changed} companies`);
if (!APPLY) console.log('Re-run with --apply to write.');
