/**
 * 세금계산서 발급 엑셀 → 미수 내역(품목) 반영
 * - 원장 잔액 유지 (syncBalance: false)
 * - 원장반영 줄과 금액 겹치면 상계 (netAgainstLedgerRef)
 *
 *   npx tsx scripts/import-tax-invoice-issuance.ts
 *   npx tsx scripts/import-tax-invoice-issuance.ts --apply
 *
 * 전체 3단 재구성은 rebuild-arrears-stack.ts --apply 권장.
 * 배포/푸시 없음. DATABASE_URL(.env.local)에 반영.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
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

import { parseTaxInvoiceIssuanceWorkbook, taxInvoiceLineTotal } from '../lib/taxInvoiceIssuanceParse';
import {
  applyFeeEvents,
  previewFeeEvents,
  stripTaxInvoiceLetterLines,
} from '../lib/arrearsLetterDb';
import type { ParsedFeeEvent } from '../lib/arrearsFeeEventParse';
import { TAX_INVOICE_DIR, TAX_INVOICE_FILES } from '../lib/arrearsStackConfig';

function readGreenRows(filePath: string): Set<number> {
  const py = path.join(root, 'scripts', 'parse-tax-invoice-green.py');
  const r = spawnSync('python', [py, filePath], { encoding: 'utf-8' });
  if (r.status !== 0) return new Set();
  try {
    const j = JSON.parse(r.stdout || '{}') as { greenRows?: number[] };
    return new Set(j.greenRows ?? []);
  } catch {
    return new Set();
  }
}

function toEvents(filePath: string, filename: string): ParsedFeeEvent[] {
  const buf = fs.readFileSync(filePath);
  const greenRows = readGreenRows(filePath);
  const lines = parseTaxInvoiceIssuanceWorkbook(buf, filename, { greenRows });
  return lines.map(line => ({
    externalCode: '',
    companyName: line.companyName,
    businessNo: line.businessNo,
    kind: 'tax_invoice' as const,
    description: line.itemName,
    amount: taxInvoiceLineTotal(line),
    eventDate: line.writeDate,
    isPayment: false,
    isNew: line.isNew || undefined,
  }));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const replaceTax = process.argv.includes('--replace-tax') || apply;
  const dirArg = process.argv.find(a => a.startsWith('--dir='));
  const dirIdx = process.argv.indexOf('--dir');
  const dir =
    dirArg?.slice('--dir='.length) ||
    (dirIdx >= 0 ? process.argv[dirIdx + 1] : TAX_INVOICE_DIR);

  console.log(apply ? '=== APPLY (원장잔액 유지 · 동일금액 스킵) ===' : '=== PREVIEW ===');
  console.log('dir:', dir);

  let all: ParsedFeeEvent[] = [];
  for (const name of TAX_INVOICE_FILES) {
    const filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) {
      console.log(`MISS ${name}`);
      continue;
    }
    const events = toEvents(filePath, name);
    const newN = events.filter(e => e.isNew).length;
    const sum = events.reduce((s, e) => s + e.amount, 0);
    console.log(`  ${name}: ${events.length}줄 · 신규 ${newN} · ${sum.toLocaleString('ko-KR')}원`);
    all = all.concat(events);
  }

  console.log(`— 합계 ${all.length}줄`);
  const preview = await previewFeeEvents(all);
  console.log(`매칭 ${preview.matched} · 미매칭 ${preview.unmatched}`);

  const unmatchedSample = preview.rows.filter(r => !r.matched).slice(0, 15);
  if (unmatchedSample.length) {
    console.log('미매칭 예시:');
    for (const r of unmatchedSample) {
      console.log(`  - ${r.companyName} / ${r.description} / ${r.amount}`);
    }
  }

  if (!apply) {
    console.log('\n반영하려면: npx tsx scripts/import-tax-invoice-issuance.ts --apply');
    console.log('전체 3단: npx tsx scripts/rebuild-arrears-stack.ts --apply');
    return;
  }

  if (replaceTax) {
    const stripped = await stripTaxInvoiceLetterLines('tax-invoice-import');
    console.log(`기존 세금계산서(tax) 줄 ${stripped.removed}건 제거 · ${stripped.entries}업체`);
  }

  const result = await applyFeeEvents(all, 'tax-invoice-import', {
    syncBalance: false,
    skipIfSameOpenAmount: true,
    skipIfPdfCovered: true,
    netAgainstLedgerRef: false,
  });
  console.log('—');
  console.log(
    `반영 ${result.applied} · PDF보유스킵 ${result.skippedPdfCovered} · 동일금액스킵 ${result.skippedSameAmount} · 중복스킵 ${result.duplicates} · 미매칭 ${result.skipped} · 업체 ${result.entryCount}`,
  );
  if (result.netted) {
    console.log(
      `원장반영 상계 ${result.netted}줄 · ${result.nettedAmount.toLocaleString('ko-KR')}원`,
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
