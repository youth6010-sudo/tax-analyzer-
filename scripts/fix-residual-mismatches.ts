/**
 * 잔여 불일치 → 공문 유지 + PDF 보강 + 필요 시 1줄 잔액맞춤
 * npx tsx scripts/fix-residual-mismatches.ts [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

import {
  listLetterLines,
  listLedgerBalanceMismatches,
  replaceLetterLines,
} from '../lib/arrearsLetterDb';
import { letterBalanceFromLines } from '../app/types/arrears';
import type { ArrearsLetterLineSource } from '../app/types/arrears';
import {
  inheritYearForMonthFeeDesc,
  isLetterCorpFeeDescription,
  ledgerDetailChargeDedupKey,
  ledgerDetailPaidDateLabel,
  parseLedgerDetailPdf,
  type LedgerDetailCompany,
} from '../lib/arrearsLedgerDetailParse';
import { DEFAULT_LEDGER_DETAIL_PDF } from '../lib/arrearsStackConfig';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'fix-residual';

type LineIn = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: ArrearsLetterLineSource;
};

function mergeLetterWithPdf(letter: LineIn[], co: LedgerDetailCompany): LineIn[] {
  const existing = [...letter];
  const chargeKeys = new Set<string>();
  for (let i = 0; i < existing.length; i++) {
    const l = existing[i];
    if (Math.round(l.amount) <= 0) continue;
    const prev = i > 0 ? existing[i - 1].description : '';
    const desc = inheritYearForMonthFeeDesc(l.description, prev);
    chargeKeys.add(ledgerDetailChargeDedupKey(desc, l.amount));
  }
  for (const l of existing) {
    if (l.source !== 'letter' || Math.round(l.amount) <= 0) continue;
    if (!isLetterCorpFeeDescription(l.description)) continue;
    chargeKeys.add(`법인조정|${Math.round(l.amount)}`);
  }

  // 금액|일자 + 일자 없는 공문 입금액(동일금액 PDF 크레딧 흡수)
  const payKeyRemain = new Map<string, number>();
  const undatedPayRemain = new Map<number, number>();
  const bump = (m: Map<string, number>, k: string, n = 1) =>
    m.set(k, (m.get(k) || 0) + n);
  const bumpN = (m: Map<number, number>, k: number, n = 1) =>
    m.set(k, (m.get(k) || 0) + n);

  for (const l of existing) {
    const p = Math.round(l.paidAmount) || 0;
    if (p <= 0) continue;
    const pd = String(l.paidDate || '').trim();
    if (pd) bump(payKeyRemain, `${p}|${pd}`);
    else bumpN(undatedPayRemain, p);
  }

  for (const tx of co.txs) {
    const amt = Math.round(tx.amount);
    if (amt <= 0) continue;
    if (tx.kind === 'debit') {
      const desc = (tx.description || '외상매출').trim();
      const key = ledgerDetailChargeDedupKey(desc, amt, tx.eventDate);
      if (chargeKeys.has(key)) continue;
      if (/법인조정/.test(desc) && chargeKeys.has(`법인조정|${amt}`)) continue;
      chargeKeys.add(key);
      existing.push({
        description: desc,
        amount: amt,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      });
    } else {
      const paidDate = ledgerDetailPaidDateLabel(tx.eventDate);
      const key = `${amt}|${paidDate}`;
      const dated = payKeyRemain.get(key) || 0;
      if (dated > 0) {
        payKeyRemain.set(key, dated - 1);
        continue;
      }
      const undated = undatedPayRemain.get(amt) || 0;
      if (undated > 0) {
        undatedPayRemain.set(amt, undated - 1);
        continue;
      }
      existing.push({
        description: (tx.description || '입금').trim() || '입금',
        amount: 0,
        paidAmount: amt,
        paidDate,
        source: 'payment',
      });
    }
  }
  return existing;
}

function bridgeToBalance(lines: LineIn[], bal: number): LineIn[] {
  const open = letterBalanceFromLines(lines);
  const gap = Math.round(bal) - open;
  if (gap === 0) return lines;
  if (gap > 0) {
    return [
      ...lines,
      {
        description: '전기이월 (잔액맞춤)',
        amount: gap,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      },
    ];
  }
  return [
    ...lines,
    {
      description: '입금 (잔액맞춤)',
      amount: 0,
      paidAmount: -gap,
      paidDate: '',
      source: 'payment',
    },
  ];
}

async function main() {
  const pdfPath = DEFAULT_LEDGER_DETAIL_PDF;
  const detail = parseLedgerDetailPdf(pdfPath);
  const byCode = new Map(detail.companies.map(c => [c.externalCode, c]));

  const before = await listLedgerBalanceMismatches({ kind: 'mismatch' });
  console.log('mismatch before', before.count, 'APPLY', APPLY);

  const report: Array<Record<string, unknown>> = [];

  for (const m of before.items) {
    const co = byCode.get(m.externalCode);
    const lines = await listLetterLines(m.entryId);
    const letter = lines
      .filter(l => l.source === 'letter')
      .map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: 'letter' as const,
      }));

    let next: LineIn[];
    let action: string;

    if (!letter.length && co) {
      next = [];
      for (const tx of co.txs) {
        const amt = Math.round(tx.amount);
        if (amt <= 0) continue;
        if (tx.kind === 'debit') {
          next.push({
            description: (tx.description || '외상매출').trim(),
            amount: amt,
            paidAmount: 0,
            paidDate: '',
            source: 'ledger',
          });
        } else {
          next.push({
            description: (tx.description || '입금').trim(),
            amount: 0,
            paidAmount: amt,
            paidDate: ledgerDetailPaidDateLabel(tx.eventDate),
            source: 'payment',
          });
        }
      }
      next = bridgeToBalance(next, m.ledgerBalance);
      action = 'pdf-replace+bridge';
    } else if (co) {
      next = mergeLetterWithPdf(letter, co);
      const mid = letterBalanceFromLines(next);
      next = bridgeToBalance(next, m.ledgerBalance);
      action =
        mid === Math.round(m.ledgerBalance)
          ? 'letter+pdf'
          : 'letter+pdf+bridge';
    } else {
      next = bridgeToBalance(letter, m.ledgerBalance);
      action = 'letter+bridge-no-pdf';
    }

    const afterOpen = letterBalanceFromLines(next);
    report.push({
      code: m.externalCode,
      name: m.companyName,
      action,
      before: m.linesOpen,
      after: afterOpen,
      bal: m.ledgerBalance,
      match: afterOpen === Math.round(m.ledgerBalance),
      bridge: afterOpen === Math.round(m.ledgerBalance) && action.includes('bridge'),
    });

    if (APPLY) {
      await replaceLetterLines(m.entryId, ACTOR, next, { syncBalance: false });
    }
  }

  for (const r of report) console.log(JSON.stringify(r));

  const after = APPLY
    ? await listLedgerBalanceMismatches({ kind: 'mismatch' })
    : before;
  console.log('mismatch after', APPLY ? after.count : '(dry-run)');
  if (APPLY) {
    for (const x of after.items) {
      console.log(
        `  ${x.externalCode} ${x.companyName} bal=${x.ledgerBalance} open=${x.linesOpen} diff=${x.diff}`,
      );
    }
  }

  fs.writeFileSync(
    path.join(root, 'scripts', '.fix-residual.json'),
    JSON.stringify({ apply: APPLY, before: before.count, after: after.count, report }, null, 2),
    'utf8',
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
