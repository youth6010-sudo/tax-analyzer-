/**
 * PDF 반영 후 불일치 정리
 * - 공문 있음: ledger/payment 제거 → PDF 재반영(전기이월 제외)
 * - 공문 없음: PDF 전체로 내역 교체(전기이월 포함)
 * - 회생채권(00234): 잔액=전기이월 한 줄
 *
 * npx tsx scripts/fix-pdf-double-count.ts [--apply]
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
  applyLedgerDetailTxs,
  listLetterLines,
  listLedgerBalanceMismatches,
  replaceLetterLines,
} from '../lib/arrearsLetterDb';
import { letterBalanceFromLines } from '../app/types/arrears';
import type { ArrearsLetterLineSource } from '../app/types/arrears';
import {
  ledgerDetailPaidDateLabel,
  parseLedgerDetailPdf,
  type LedgerDetailCompany,
} from '../lib/arrearsLedgerDetailParse';
import { DEFAULT_LEDGER_DETAIL_PDF } from '../lib/arrearsStackConfig';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'fix-pdf-double';

function txsToLines(
  co: LedgerDetailCompany,
  opts?: { skipCarry?: boolean },
): Array<{
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: ArrearsLetterLineSource;
}> {
  const out: Array<{
    description: string;
    amount: number;
    paidAmount: number;
    paidDate: string;
    source: ArrearsLetterLineSource;
  }> = [];
  for (const tx of co.txs) {
    const amt = Math.round(tx.amount);
    if (amt <= 0) continue;
    const desc = (tx.description || '').trim();
    if (opts?.skipCarry && /^전기이월/.test(desc)) continue;
    if (tx.kind === 'debit') {
      out.push({
        description: desc || '외상매출',
        amount: amt,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      });
    } else {
      out.push({
        description: desc || '입금',
        amount: 0,
        paidAmount: amt,
        paidDate: ledgerDetailPaidDateLabel(tx.eventDate),
        source: 'payment',
      });
    }
  }
  return out;
}

async function main() {
  const pdfPath = process.argv.find(a => a.endsWith('.pdf')) || DEFAULT_LEDGER_DETAIL_PDF;
  console.log('PDF', pdfPath, 'exists', fs.existsSync(pdfPath), 'APPLY', APPLY);

  const detail = parseLedgerDetailPdf(pdfPath);
  const byCode = new Map(detail.companies.map(c => [c.externalCode, c]));

  const before = await listLedgerBalanceMismatches({ kind: 'mismatch' });
  console.log('mismatch before', before.count);

  const report: Array<Record<string, unknown>> = [];
  const reapplyCos: LedgerDetailCompany[] = [];

  for (const m of before.items) {
    const co = byCode.get(m.externalCode);
    const lines = await listLetterLines(m.entryId);
    const letterLines = lines.filter(l => l.source === 'letter');
    const hasLetter = letterLines.length > 0;

    if (m.externalCode === '00234') {
      // 회생채권: 잔액 한 줄
      const next = [
        {
          description: '전기이월 (회생채권)',
          amount: Math.round(m.ledgerBalance),
          paidAmount: 0,
          paidDate: '',
          source: 'ledger' as const,
        },
      ];
      const open = letterBalanceFromLines(next);
      report.push({
        code: m.externalCode,
        name: m.companyName,
        action: 'rehab-single-carry',
        before: m.linesOpen,
        after: open,
        bal: m.ledgerBalance,
      });
      if (APPLY) {
        await replaceLetterLines(m.entryId, ACTOR, next, { syncBalance: false });
      }
      continue;
    }

    if (!co) {
      report.push({
        code: m.externalCode,
        name: m.companyName,
        action: 'skip-no-pdf',
        before: m.linesOpen,
        bal: m.ledgerBalance,
      });
      continue;
    }

    if (!hasLetter) {
      const next = txsToLines(co, { skipCarry: false });
      const open = letterBalanceFromLines(next);
      report.push({
        code: m.externalCode,
        name: m.companyName,
        action: 'replace-from-pdf',
        before: m.linesOpen,
        after: open,
        bal: m.ledgerBalance,
        match: open === Math.round(m.ledgerBalance),
      });
      if (APPLY) {
        await replaceLetterLines(m.entryId, ACTOR, next, { syncBalance: false });
      }
      continue;
    }

    // 공문 유지 + ledger/payment/tax 제거 후, 전기이월 없이 PDF 재적용
    const kept = letterLines.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: 'letter' as const,
    }));
    const letterOpen = letterBalanceFromLines(kept);

    report.push({
      code: m.externalCode,
      name: m.companyName,
      action: 'keep-letter-reapply-pdf-no-carry',
      before: m.linesOpen,
      letterOpen,
      bal: m.ledgerBalance,
      letterMatch: letterOpen === Math.round(m.ledgerBalance),
    });

    if (APPLY) {
      await replaceLetterLines(m.entryId, ACTOR, kept, { syncBalance: false });
      reapplyCos.push({
        ...co,
        txs: co.txs.filter(t => !(t.kind === 'debit' && /^전기이월/.test(t.description || ''))),
      });
    }
  }

  if (APPLY && reapplyCos.length) {
    const applied = await applyLedgerDetailTxs(reapplyCos, ACTOR);
    console.log('reapply pdf (no carry)', applied);
  }

  const after = APPLY
    ? await listLedgerBalanceMismatches({ kind: 'mismatch' })
    : before;

  console.log('\n=== plan sample ===');
  for (const r of report.slice(0, 25)) {
    console.log(JSON.stringify(r));
  }
  console.log(`... total planned ${report.length}`);

  const matchN = report.filter(r => r.match === true || r.letterMatch === true).length;
  console.log('would-match-or-letter-ok', matchN);

  if (APPLY) {
    console.log('\nmismatch after', after.count);
    for (const x of after.items.slice(0, 20)) {
      console.log(
        `  ${x.externalCode} ${x.companyName} bal=${x.ledgerBalance} open=${x.linesOpen} diff=${x.diff}`,
      );
    }
  } else {
    console.log('\n(dry-run) --apply 로 실행하세요');
  }

  fs.writeFileSync(
    path.join(root, 'scripts', '.fix-pdf-double-count.json'),
    JSON.stringify({ apply: APPLY, before: before.count, after: after.count, report }, null, 2),
    'utf8',
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
