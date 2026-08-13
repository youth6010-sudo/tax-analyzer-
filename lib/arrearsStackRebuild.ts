/**
 * 미수 레이어 재구성
 *
 * 개념: 공문(기본) → 원장상세 2026(차·대) → 세금계산서(A스킵) → 원장잔액 대조
 *
 * 실행:
 *  1) wipe + 공문 import
 *  2) 요약 원장 upsert + 공문→코드행 병합
 *  3) 원장 상세 PDF 차변·대변 반영
 *  4) 세금계산서 (동일금액 스킵)
 *  5) 플러그 제거 + 잔액불일치 리포트
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { parseArrearsLetterWorkbookFile } from '@/lib/arrearsLetterParse';
import {
  applyFeeEvents,
  applyLedgerDetailTxs,
  applyLedgerOnlyCarryIn,
  listLedgerBalanceMismatches,
  previewFeeEvents,
  stripLedgerSyncLetterLines,
  stripTaxInvoiceLetterLines,
  upsertLetterImport,
  type LedgerBalanceMismatch,
} from '@/lib/arrearsLetterDb';
import type { ParsedFeeEvent } from '@/lib/arrearsFeeEventParse';
import {
  asOfDateFromLedgerFilename,
  parseLedgerArrearsWorkbook,
} from '@/lib/arrearsLedgerParse';
import { parseLedgerDetailPdf } from '@/lib/arrearsLedgerDetailParse';
import {
  applyLedgerWithLetterLinks,
  wipeAllArrears,
} from '@/lib/arrearsRestart';
import {
  parseTaxInvoiceIssuanceWorkbook,
  taxInvoiceLineTotal,
} from '@/lib/taxInvoiceIssuanceParse';
import {
  DEFAULT_LEDGER_DETAIL_PDF,
  DEFAULT_LEDGER_PATH,
  LETTER_DIR,
  LETTER_FILES,
  TAX_INVOICE_DIR,
  TAX_INVOICE_FILES,
  assertStackFilesExist,
  type StackFileCheck,
} from '@/lib/arrearsStackConfig';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export type StackRebuildReport = {
  dryRun: boolean;
  ledgerPath: string;
  ledgerDetailPdf: string;
  missingFiles: StackFileCheck[];
  layer1: {
    wiped: { entries: number; lines: number; links: number } | null;
    sheets: number;
    created: number;
    updated: number;
    totalLines: number;
    files: Array<{ name: string; sheets: number; lines: number; managerName: string }>;
  };
  layer2: {
    events: number;
    matched: number;
    unmatched: number;
    stripped: { entries: number; removed: number } | null;
    applied: number;
    duplicates: number;
    skipped: number;
    skippedSameAmount: number;
    skippedPdfCovered: number;
    entryCount: number;
    netted: number;
    nettedAmount: number;
    unmatchedSample: Array<{ companyName: string; description: string; amount: number }>;
    files: Array<{ name: string; lines: number; newCount: number; sum: number }>;
  };
  layerDetail: {
    companies: number;
    txs: number;
    applied: number;
    skippedDup: number;
    unmatchedCode: number;
    skippedAgentLike: number;
    entryCount: number;
    debitApplied: number;
    creditApplied: number;
  };
  layer3: {
    asOfDate: string;
    ledgerRows: number;
    ledgerUpdated: number;
    ledgerInserted: number;
    attached: number;
    skipped: number;
    keptUnmatched: number;
    deletedOrphans: number;
    failed: number;
    strippedSync: { entries: number; removed: number } | null;
    carryIn: { applied: number; entryCount: number; totalAmount: number } | null;
    mismatchCount: number;
    ledgerOnlyCount: number;
    mismatchSample: LedgerBalanceMismatch[];
    withCredit: number;
    withBalance: number;
  };
};

function readGreenRows(filePath: string): Set<number> {
  const py = path.join(repoRoot, 'scripts', 'parse-tax-invoice-green.py');
  const r = spawnSync('python', [py, filePath], { encoding: 'utf-8' });
  if (r.status !== 0) return new Set();
  try {
    const j = JSON.parse(r.stdout || '{}') as { greenRows?: number[] };
    return new Set(j.greenRows ?? []);
  } catch {
    return new Set();
  }
}

function taxEventsFromFile(filePath: string, filename: string): ParsedFeeEvent[] {
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

function emptyReport(
  dryRun: boolean,
  ledgerPath: string,
  ledgerDetailPdf: string,
): StackRebuildReport {
  return {
    dryRun,
    ledgerPath,
    ledgerDetailPdf,
    missingFiles: [],
    layer1: {
      wiped: null,
      sheets: 0,
      created: 0,
      updated: 0,
      totalLines: 0,
      files: [],
    },
    layer2: {
      events: 0,
      matched: 0,
      unmatched: 0,
      stripped: null,
      applied: 0,
      duplicates: 0,
      skipped: 0,
      skippedSameAmount: 0,
      skippedPdfCovered: 0,
      entryCount: 0,
      netted: 0,
      nettedAmount: 0,
      unmatchedSample: [],
      files: [],
    },
    layerDetail: {
      companies: 0,
      txs: 0,
      applied: 0,
      skippedDup: 0,
      unmatchedCode: 0,
      skippedAgentLike: 0,
      entryCount: 0,
      debitApplied: 0,
      creditApplied: 0,
    },
    layer3: {
      asOfDate: '',
      ledgerRows: 0,
      ledgerUpdated: 0,
      ledgerInserted: 0,
      attached: 0,
      skipped: 0,
      keptUnmatched: 0,
      deletedOrphans: 0,
      failed: 0,
      strippedSync: null,
      carryIn: null,
      mismatchCount: 0,
      ledgerOnlyCount: 0,
      mismatchSample: [],
      withCredit: 0,
      withBalance: 0,
    },
  };
}

export async function rebuildArrearsStack(opts: {
  actorName: string;
  ledgerPath?: string;
  ledgerDetailPdf?: string;
  letterDir?: string;
  taxDir?: string;
  keepUnmatchedLetters?: boolean;
  dryRun?: boolean;
}): Promise<StackRebuildReport> {
  const actor = opts.actorName.trim() || 'stack-rebuild';
  const dryRun = opts.dryRun === true;
  const letterDir = opts.letterDir ?? LETTER_DIR;
  const taxDir = opts.taxDir ?? TAX_INVOICE_DIR;
  const ledgerPath = opts.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const ledgerDetailPdf = opts.ledgerDetailPdf ?? DEFAULT_LEDGER_DETAIL_PDF;
  const keepUnmatched = opts.keepUnmatchedLetters !== false;

  const report = emptyReport(dryRun, ledgerPath, ledgerDetailPdf);

  const fileCheck = assertStackFilesExist({
    letterDir,
    taxDir,
    ledgerPath,
    ledgerDetailPdf,
  });
  report.missingFiles = fileCheck.missing;
  if (!fileCheck.ok) {
    return report;
  }

  // ── 1) 공문 ────────────────────────────────────────────────
  if (!dryRun) {
    report.layer1.wiped = await wipeAllArrears();
  }

  for (const name of LETTER_FILES) {
    const filePath = path.join(letterDir, name);
    const buf = fs.readFileSync(filePath);
    const parsed = parseArrearsLetterWorkbookFile(buf, name);
    report.layer1.sheets += parsed.sheets.length;
    report.layer1.files.push({
      name,
      sheets: parsed.sheets.length,
      lines: parsed.sheets.reduce((s, sh) => s + sh.lines.length, 0),
      managerName: parsed.managerName,
    });

    if (dryRun) {
      report.layer1.totalLines += parsed.sheets.reduce((s, sh) => s + sh.lines.length, 0);
      continue;
    }

    const result = await upsertLetterImport(parsed.sheets, parsed.managerName, actor, {
      unmatchedCreate: true,
      syncBalance: true,
    });
    report.layer1.created += result.created;
    report.layer1.updated += result.updated;
    report.layer1.totalLines += result.totalLines;
  }

  // 세금계산서 파싱 (반영은 원장 병합 후 — 코드행 매칭용)
  let allEvents: ParsedFeeEvent[] = [];
  for (const name of TAX_INVOICE_FILES) {
    const filePath = path.join(taxDir, name);
    const events = taxEventsFromFile(filePath, name);
    const newCount = events.filter(e => e.isNew).length;
    const sum = events.reduce((s, e) => s + e.amount, 0);
    report.layer2.files.push({ name, lines: events.length, newCount, sum });
    allEvents = allEvents.concat(events);
  }
  report.layer2.events = allEvents.length;

  // ── 2) 원장 upsert + 공문 병합 (업체 코드 확보) ────────────
  const ledgerBuf = fs.readFileSync(ledgerPath);
  const ledgerRows = parseLedgerArrearsWorkbook(ledgerBuf);
  const asOfDate = asOfDateFromLedgerFilename(path.basename(ledgerPath));
  report.layer3.asOfDate = asOfDate;
  report.layer3.ledgerRows = ledgerRows.length;
  report.layer3.withCredit = ledgerRows.filter(r => r.credit > 0).length;
  report.layer3.withBalance = ledgerRows.filter(r => r.balance !== 0).length;

  if (!dryRun) {
    const linkResult = await applyLedgerWithLetterLinks({
      ledgerRows,
      asOfDate,
      actorName: actor,
      keepUnmatchedLetters: keepUnmatched,
    });
    report.layer3.ledgerUpdated = linkResult.ledgerUpdated;
    report.layer3.ledgerInserted = linkResult.ledgerInserted;
    report.layer3.attached = linkResult.attached;
    report.layer3.skipped = linkResult.skipped;
    report.layer3.keptUnmatched = linkResult.keptUnmatched;
    report.layer3.deletedOrphans = linkResult.deletedOrphans;
    report.layer3.failed = linkResult.failed;
  }

  // ── 3) 원장 상세 PDF (2026 차변·대변) ──────────────────────
  const detail = parseLedgerDetailPdf(ledgerDetailPdf);
  report.layerDetail.companies = detail.companyCount;
  report.layerDetail.txs = detail.txCount;
  if (!dryRun) {
    const appliedDetail = await applyLedgerDetailTxs(detail.companies, actor);
    report.layerDetail.applied = appliedDetail.applied;
    report.layerDetail.skippedDup = appliedDetail.skippedDup;
    report.layerDetail.unmatchedCode = appliedDetail.unmatchedCode;
    report.layerDetail.skippedAgentLike = appliedDetail.skippedAgentLike;
    report.layerDetail.entryCount = appliedDetail.entryCount;
    report.layerDetail.debitApplied = appliedDetail.debitApplied;
    report.layerDetail.creditApplied = appliedDetail.creditApplied;
  }

  // ── 4) 세금계산서 (확인·PDF 미보유분만 보충) ────
  if (dryRun) {
    const preview = await previewFeeEvents(allEvents);
    report.layer2.matched = preview.matched;
    report.layer2.unmatched = preview.unmatched;
    report.layer2.unmatchedSample = preview.rows
      .filter(r => !r.matched)
      .slice(0, 15)
      .map(r => ({
        companyName: r.companyName,
        description: r.description,
        amount: r.amount,
      }));
  } else {
    report.layer2.stripped = await stripTaxInvoiceLetterLines(actor);
    const applied = await applyFeeEvents(allEvents, actor, {
      syncBalance: false,
      skipIfSameOpenAmount: true,
      skipIfPdfCovered: true,
      netAgainstLedgerRef: false,
    });
    report.layer2.applied = applied.applied;
    report.layer2.duplicates = applied.duplicates;
    report.layer2.skipped = applied.skipped;
    report.layer2.skippedSameAmount = applied.skippedSameAmount;
    report.layer2.skippedPdfCovered = applied.skippedPdfCovered;
    report.layer2.entryCount = applied.entryCount;
    report.layer2.netted = applied.netted;
    report.layer2.nettedAmount = applied.nettedAmount;
    report.layer2.unmatched = applied.skipped;
    report.layer2.matched = allEvents.length - applied.skipped;

    if (applied.skipped) {
      const preview = await previewFeeEvents(allEvents);
      report.layer2.unmatchedSample = preview.rows
        .filter(r => !r.matched)
        .slice(0, 15)
        .map(r => ({
          companyName: r.companyName,
          description: r.description,
          amount: r.amount,
        }));
    }
  }

  // ── 5) 플러그 제거 → 원장만 전기이월 → 잔액불일치 리포트
  if (!dryRun) {
    report.layer3.strippedSync = await stripLedgerSyncLetterLines(actor);
    report.layer3.carryIn = await applyLedgerOnlyCarryIn(actor, report.layer3.asOfDate);
    const mismatches = await listLedgerBalanceMismatches({
      kind: 'mismatch',
      limit: 30,
    });
    report.layer3.mismatchCount = mismatches.count;
    report.layer3.mismatchSample = mismatches.items;
    report.layer3.ledgerOnlyCount = mismatches.ledgerOnlyCount;
  }

  return report;
}

export function formatStackRebuildReport(report: StackRebuildReport): string {
  const lines: string[] = [];
  lines.push(report.dryRun ? '=== PREVIEW (DB 변경 없음) ===' : '=== APPLY (재구성) ===');
  lines.push(`원장: ${report.ledgerPath}`);
  lines.push(`상세PDF: ${report.ledgerDetailPdf}`);
  if (!report.dryRun) {
    lines.push('실행: 공문 → 원장병합 → 원장상세PDF → 세금계산서(확인·PDF미보유분 보충) → 잔액불일치');
  }

  if (report.missingFiles.length) {
    lines.push('— 누락 파일 —');
    for (const m of report.missingFiles) {
      lines.push(`  [${m.layer}] ${m.path}`);
    }
    return lines.join('\n');
  }

  lines.push('— Layer1 공문 —');
  if (report.layer1.wiped) {
    lines.push(
      `  wipe entries ${report.layer1.wiped.entries} · lines ${report.layer1.wiped.lines} · links ${report.layer1.wiped.links}`,
    );
  }
  for (const f of report.layer1.files) {
    lines.push(`  ${f.name}: 시트 ${f.sheets} · 줄 ${f.lines} · 담당 ${f.managerName}`);
  }
  lines.push(
    `  합계 시트 ${report.layer1.sheets} · 생성 ${report.layer1.created} · 갱신 ${report.layer1.updated} · 줄 ${report.layer1.totalLines}`,
  );

  lines.push('— Layer2 세금계산서(확인·PDF미보유분 보충) —');
  for (const f of report.layer2.files) {
    lines.push(
      `  ${f.name}: ${f.lines}줄 · 신규 ${f.newCount} · ${f.sum.toLocaleString('ko-KR')}원`,
    );
  }
  lines.push(`  합계 ${report.layer2.events}줄`);
  if (report.dryRun) {
    lines.push(
      `  (현재 DB 기준 preview) 매칭 ${report.layer2.matched} · 미매칭 ${report.layer2.unmatched}`,
    );
  } else {
    if (report.layer2.stripped) {
      lines.push(
        `  기존 tax 줄 제거 ${report.layer2.stripped.removed} · ${report.layer2.stripped.entries}업체`,
      );
    }
    lines.push(
      `  반영 ${report.layer2.applied} · PDF보유스킵 ${report.layer2.skippedPdfCovered} · 동일금액스킵 ${report.layer2.skippedSameAmount} · 중복 ${report.layer2.duplicates} · 미매칭 ${report.layer2.skipped} · 업체 ${report.layer2.entryCount}`,
    );
    if (report.layer2.netted) {
      lines.push(
        `  원장반영 상계 ${report.layer2.netted}줄 · ${report.layer2.nettedAmount.toLocaleString('ko-KR')}원`,
      );
    }
  }
  if (report.layer2.unmatchedSample.length) {
    lines.push('  미매칭 예시:');
    for (const r of report.layer2.unmatchedSample) {
      lines.push(`    - ${r.companyName} / ${r.description} / ${r.amount}`);
    }
  }

  lines.push('— 원장상세 PDF —');
  lines.push(
    `  업체 ${report.layerDetail.companies} · 거래 ${report.layerDetail.txs}`,
  );
  if (!report.dryRun) {
    lines.push(
      `  반영 ${report.layerDetail.applied} (차 ${report.layerDetail.debitApplied} · 대 ${report.layerDetail.creditApplied}) · 중복스킵 ${report.layerDetail.skippedDup} · 신고대리형스킵 ${report.layerDetail.skippedAgentLike} · 코드미매칭 ${report.layerDetail.unmatchedCode} · 업체 ${report.layerDetail.entryCount}`,
    );
  }

  lines.push('— Layer3 거래처원장 —');
  lines.push(
    `  ${report.layer3.ledgerRows}행 · 기준일 ${report.layer3.asOfDate} · 대변 ${report.layer3.withCredit} · 잔액≠0 ${report.layer3.withBalance}`,
  );
  if (!report.dryRun) {
    lines.push(
      `  원장 갱신 ${report.layer3.ledgerUpdated} · 신규 ${report.layer3.ledgerInserted}`,
    );
    lines.push(
      `  공문 부착 ${report.layer3.attached} · 제외 ${report.layer3.skipped} · 미연결유지 ${report.layer3.keptUnmatched} · orphan ${report.layer3.deletedOrphans} · 실패 ${report.layer3.failed}`,
    );
    if (report.layer3.strippedSync) {
      lines.push(
        `  원장반영 플러그 제거 ${report.layer3.strippedSync.removed}줄 · ${report.layer3.strippedSync.entries}업체`,
      );
    }
    if (report.layer3.carryIn) {
      lines.push(
        `  원장만 전기이월 ${report.layer3.carryIn.applied}업체 · ${report.layer3.carryIn.totalAmount.toLocaleString('ko-KR')}원`,
      );
    }
    lines.push(
      `  잔액불일치 ${report.layer3.mismatchCount}업체 · 원장만(장기미수·미맞춤) ${report.layer3.ledgerOnlyCount}업체`,
    );
    for (const m of report.layer3.mismatchSample.slice(0, 15)) {
      lines.push(
        `    - ${m.companyName} (${m.externalCode}): 원장 ${m.ledgerBalance.toLocaleString('ko-KR')} · 내역 ${m.linesOpen.toLocaleString('ko-KR')} · 차 ${m.diff.toLocaleString('ko-KR')}`,
      );
    }
  }

  return lines.join('\n');
}
