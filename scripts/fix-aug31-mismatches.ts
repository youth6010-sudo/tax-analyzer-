/**
 * 8/31 PDF 반영 후 잔여 불일치 보정 (인디 담당 제외)
 * npx tsx scripts/fix-aug31-mismatches.ts [--apply]
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

import { getDb } from '../db';
import { arrearsEntries } from '../db/schema';
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

const APPLY = process.argv.includes('--apply');
const ACTOR = 'fix-aug31';
const PDF = String.raw`c:\Users\찰리\Desktop\8월 31일 수정분 거래처원장.pdf`;
const SKIP_MANAGERS = new Set(['인디']);

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
    if (/성실/.test(l.description)) chargeKeys.add(`성실|${Math.round(l.amount)}`);
  }

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
      if (/성실/.test(desc) && chargeKeys.has(`성실|${amt}`)) continue;
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

function dedupeCarryLines(lines: LineIn[]): LineIn[] {
  const carry = lines.filter(
    l =>
      l.source === 'ledger' &&
      Math.round(l.amount) > 0 &&
      /전기이월/.test(l.description),
  );
  if (carry.length <= 1) return lines;
  const amounts = carry.map(l => Math.round(l.amount));
  const unique = new Set(amounts);
  if (unique.size !== 1) return lines;
  let kept = false;
  return lines.filter(l => {
    if (
      l.source === 'ledger' &&
      Math.round(l.amount) > 0 &&
      /전기이월/.test(l.description)
    ) {
      if (kept) return false;
      kept = true;
      return true;
    }
    return true;
  });
}

function dropDuplicateVatLetterLine(lines: LineIn[]): LineIn[] {
  const hasJanLedgerVat = lines.some(
    l =>
      l.source === 'ledger' &&
      /부가세/.test(l.description) &&
      Math.round(l.amount) === 55000,
  );
  if (!hasJanLedgerVat) return lines;
  let removed = false;
  return lines.filter(l => {
    if (
      !removed &&
      l.source === 'letter' &&
      /부가세.*르엘|스테이|지오2/i.test(l.description) &&
      Math.round(l.amount) === 165000
    ) {
      removed = true;
      return false;
    }
    return true;
  });
}

async function main() {
  const detail = parseLedgerDetailPdf(PDF);
  const byCode = new Map(detail.companies.map(c => [c.externalCode, c]));
  const db = getDb();
  const before = await listLedgerBalanceMismatches({ kind: 'mismatch' });
  console.log('before', before.count, 'APPLY', APPLY);

  for (const m of before.items) {
    const [ent] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.id, m.entryId))
      .limit(1);
    if (!ent || SKIP_MANAGERS.has(ent.managerName || '')) {
      console.log('skip', m.externalCode, m.companyName, 'mgr=', ent?.managerName);
      continue;
    }

    const co = byCode.get(m.externalCode);
    const raw = await listLetterLines(m.entryId);
    let letter = raw
      .filter(l => l.source === 'letter')
      .map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: 'letter' as const,
      }));

    let action = '';
    let next: LineIn[];

    if (m.externalCode === '00234') {
      const ledgerOnly = raw
        .filter(l => l.source === 'ledger')
        .map(l => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate,
          source: 'ledger' as const,
        }));
      next = dedupeCarryLines(ledgerOnly);
      action = 'dedupe-carry';
    } else if (m.externalCode === '00165') {
      const merged = co ? mergeLetterWithPdf(letter, co) : letter;
      next = dropDuplicateVatLetterLine(merged);
      action = 'drop-dup-vat-letter';
    } else if (co) {
      next = mergeLetterWithPdf(letter, co);
      action = 'letter+pdf';
    } else {
      next = letter;
      action = 'letter-only';
    }

    next = bridgeToBalance(next, m.ledgerBalance);
    const afterOpen = letterBalanceFromLines(next);
    console.log(
      JSON.stringify({
        code: m.externalCode,
        name: m.companyName,
        action,
        before: m.linesOpen,
        after: afterOpen,
        bal: m.ledgerBalance,
        ok: afterOpen === Math.round(m.ledgerBalance),
      }),
    );

    if (APPLY && afterOpen === Math.round(m.ledgerBalance)) {
      await replaceLetterLines(m.entryId, ACTOR, next, { syncBalance: false });
    }
  }

  if (APPLY) {
    const after = await listLedgerBalanceMismatches({ kind: 'mismatch' });
    console.log('after', after.count);
    for (const x of after.items) {
      const [ent] = await db
        .select({ managerName: arrearsEntries.managerName })
        .from(arrearsEntries)
        .where(eq(arrearsEntries.id, x.entryId))
        .limit(1);
      console.log(' remain', x.externalCode, x.companyName, 'mgr=', ent?.managerName, 'diff', x.diff);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
