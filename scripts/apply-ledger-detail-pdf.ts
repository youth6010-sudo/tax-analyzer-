/**
 * 2026 거래처원장 상세 PDF → 미수 내역(차·대) 반영 + 기말잔액 동기화
 * npx tsx scripts/apply-ledger-detail-pdf.ts [pdf경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
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
import { DEFAULT_LEDGER_DETAIL_PDF } from '../lib/arrearsStackConfig';
import { parseLedgerDetailPdf } from '../lib/arrearsLedgerDetailParse';
import {
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from '../lib/arrearsLetterDb';

type YearCo = {
  externalCode: string;
  companyName: string;
  endingBalance: number | null;
  openingCarry: number | null;
};

async function syncBalancesFromPdfEnding(
  pdfPath: string,
  asOfDate: string,
  actor: string,
): Promise<{ updated: number; insertedHint: number }> {
  const jsonPath = path.join(root, '.tmp-year-balances-apply.json');
  const py = path.join(root, 'scripts', 'parse-ledger-year-balances.py');
  const r = spawnSync('python', ['-X', 'utf8', py, jsonPath, pdfPath], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'year balance parse fail');
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
    years?: Array<{ year?: number; companies?: YearCo[] }>;
  };
  try {
    fs.unlinkSync(jsonPath);
  } catch {
    /* ignore */
  }

  const companies =
    raw.years?.flatMap(y => y.companies || []) ??
    ((raw as unknown as { companies?: YearCo[] }).companies || []);
  const byCode = new Map(
    companies
      .filter(c => c.endingBalance != null)
      .map(c => [c.externalCode, c]),
  );

  const db = getDb();
  const existing = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      balance: arrearsEntries.balance,
    })
    .from(arrearsEntries);
  const existingByCode = new Map(existing.map(e => [e.externalCode, e]));

  let updated = 0;
  let asOfTouched = 0;
  const now = new Date();
  for (const [code, co] of byCode) {
    const ent = existingByCode.get(code);
    if (!ent) continue;
    const bal = Math.round(co.endingBalance!);
    const balChanged = Math.round(ent.balance) !== bal;
    if (!balChanged) {
      // 잔액 동일해도 기준일은 PDF 출력일로
      await db
        .update(arrearsEntries)
        .set({ asOfDate, updatedBy: actor, updatedAt: now })
        .where(eq(arrearsEntries.id, ent.id));
      asOfTouched += 1;
      continue;
    }
    await db
      .update(arrearsEntries)
      .set({
        balance: bal,
        asOfDate,
        source: 'ledger',
        updatedBy: actor,
        updatedAt: now,
      })
      .where(eq(arrearsEntries.id, ent.id));
    updated += 1;
  }

  return { updated, asOfTouched, matched: byCode.size };
}

async function main() {
  const pdfPath = process.argv[2] || DEFAULT_LEDGER_DETAIL_PDF;
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF 없음: ${pdfPath}`);
  }

  const asOfDate = (() => {
    const m = path.basename(pdfPath).match(/20(\d{2})(\d{2})(\d{2})/);
    if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  })();

  console.log('PDF', pdfPath);
  console.log('asOf', asOfDate);

  const detail = parseLedgerDetailPdf(pdfPath);
  console.log(
    `parse companies=${detail.companyCount} txs=${detail.txCount} debit=${detail.debitCount} credit=${detail.creditCount}`,
  );

  const applied = await applyLedgerDetailTxs(detail.companies, 'pdf-20260824');
  console.log('detail apply', applied);

  const bal = await syncBalancesFromPdfEnding(pdfPath, asOfDate, 'pdf-20260824');
  console.log('balance sync', bal);

  const mm = await listLedgerBalanceMismatches();
  console.log(`mismatch after: ${mm.count}`);
  for (const x of mm.items.slice(0, 12)) {
    console.log(
      `  ${x.externalCode} ${x.companyName} bal=${x.ledgerBalance.toLocaleString('ko-KR')} open=${x.linesOpen.toLocaleString('ko-KR')} diff=${x.diff.toLocaleString('ko-KR')} (${x.kind})`,
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
