import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import {
  getArrearsManualBalance,
  isArrearsBalanceLocked,
} from '@/lib/arrearsBalanceLock';
import {
  isAfterCutoff,
  normalizeDotDate,
  readArrearsImportConfig,
  toIsoDate,
  writeArrearsImportConfig,
} from '@/lib/arrearsImportConfig';
import {
  clientDetailTxToLineInput,
  lineDedupKey,
  parseArrearsClientDetailWorkbook,
  type ParsedClientDetailTx,
} from '@/lib/arrearsClientDetailParse';
import {
  parseArrearsStatusWorkbook,
  type ParsedStatusRow,
} from '@/lib/arrearsStatusParse';
import { isInactiveArrearsCode } from '@/lib/arrearsInactiveSeed';
import { listLetterLines, replaceLetterLines } from '@/lib/arrearsLetterDb';
import type { ArrearsLetterLineInput } from '@/app/types/arrears';
import { letterBalanceFromLines } from '@/app/types/arrears';

export type StatusImportPreview = {
  preview: true;
  asOfDate: string;
  rowCount: number;
  totalBalance: number;
  sample: ParsedStatusRow[];
};

export type StatusImportResult = {
  preview: false;
  asOfDate: string;
  updated: number;
  inserted: number;
  totalBalance: number;
};

export type ClientDetailImportPreview = {
  preview: true;
  cutoffDate: string;
  companyCount: number;
  txCount: number;
  sample: Array<{
    externalCode: string;
    companyName: string;
    eventDate: string;
    description: string;
    debit: number;
    credit: number;
  }>;
};

export type ClientDetailImportResult = {
  preview: false;
  cutoffDate: string;
  applied: number;
  skippedInactive: number;
  skippedNoEntry: number;
  linesAdded: number;
};

export async function previewStatusImport(
  buffer: Buffer,
  asOfDateOverride?: string,
): Promise<StatusImportPreview> {
  const parsed = parseArrearsStatusWorkbook(buffer);
  const asOfDate = normalizeDotDate(asOfDateOverride) || parsed.asOfDate;
  const totalBalance = parsed.rows.reduce((s, r) => s + r.balance, 0);
  return {
    preview: true,
    asOfDate,
    rowCount: parsed.rows.length,
    totalBalance,
    sample: parsed.rows.filter(r => r.balance !== 0).slice(0, 12),
  };
}

export async function applyStatusImport(
  buffer: Buffer,
  actorName: string,
  asOfDateOverride?: string,
): Promise<StatusImportResult> {
  const parsed = parseArrearsStatusWorkbook(buffer);
  const asOfDate = normalizeDotDate(asOfDateOverride) || parsed.asOfDate;
  const asOfIso = toIsoDate(asOfDate);
  const db = getDb();
  let updated = 0;
  let inserted = 0;

  for (const row of parsed.rows) {
    const locked = getArrearsManualBalance(row.externalCode);
    const balance = locked !== undefined ? locked : row.balance;

    const [prev] = await db
      .select({ id: arrearsEntries.id })
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, row.externalCode))
      .limit(1);

    if (prev) {
      await db
        .update(arrearsEntries)
        .set({
          companyName: row.companyName,
          balance,
          carryIn: locked !== undefined ? locked : row.carryIn,
          debit: row.debit,
          credit: row.credit,
          managerName: row.managerName || undefined,
          mgmtCategory: row.mgmtCategory,
          cmsNote: row.cmsNote,
          memo: row.memo,
          asOfDate: asOfIso,
          source: 'status',
          updatedBy: actorName,
          updatedAt: new Date(),
        })
        .where(eq(arrearsEntries.externalCode, row.externalCode));
      updated += 1;
    } else {
      await db.insert(arrearsEntries).values({
        externalCode: row.externalCode,
        companyName: row.companyName,
        balance,
        carryIn: row.carryIn,
        debit: row.debit,
        credit: row.credit,
        managerName: row.managerName,
        mgmtCategory: row.mgmtCategory,
        cmsNote: row.cmsNote,
        memo: row.memo,
        asOfDate: asOfIso,
        source: 'status',
        updatedBy: actorName,
      });
      inserted += 1;
    }
  }

  writeArrearsImportConfig({ statusAsOfDate: asOfDate });

  const totalBalance = parsed.rows.reduce(
    (s, r) => s + (getArrearsManualBalance(r.externalCode) ?? r.balance),
    0,
  );

  return { preview: false, asOfDate, updated, inserted, totalBalance };
}

function groupTxByCode(txs: ParsedClientDetailTx[]): Map<string, ParsedClientDetailTx[]> {
  const m = new Map<string, ParsedClientDetailTx[]>();
  for (const tx of txs) {
    const arr = m.get(tx.externalCode) ?? [];
    arr.push(tx);
    m.set(tx.externalCode, arr);
  }
  return m;
}

export async function previewClientDetailImport(
  buffer: Buffer,
  cutoffOverride?: string,
): Promise<ClientDetailImportPreview> {
  const cfg = readArrearsImportConfig();
  const cutoffDate = normalizeDotDate(cutoffOverride) || cfg.letterCutoffDate;
  const txs = parseArrearsClientDetailWorkbook(buffer).filter(t =>
    isAfterCutoff(t.eventDate, cutoffDate),
  );
  const byCode = groupTxByCode(txs);
  return {
    preview: true,
    cutoffDate,
    companyCount: byCode.size,
    txCount: txs.length,
    sample: txs.slice(0, 15).map(t => ({
      externalCode: t.externalCode,
      companyName: t.companyName,
      eventDate: t.eventDate,
      description: t.ledgerDescription,
      debit: t.debit,
      credit: t.credit,
    })),
  };
}

/** 공문(letter) 줄은 유지, 원장 플러그(전기이월 등) 제거 후 cutoff 이후 상세만 추가 */
export async function applyClientDetailImport(
  buffer: Buffer,
  actorName: string,
  cutoffOverride?: string,
): Promise<ClientDetailImportResult> {
  const cfg = readArrearsImportConfig();
  const cutoffDate = normalizeDotDate(cutoffOverride) || cfg.letterCutoffDate;
  writeArrearsImportConfig({ letterCutoffDate: cutoffDate });

  const txs = parseArrearsClientDetailWorkbook(buffer).filter(t =>
    isAfterCutoff(t.eventDate, cutoffDate),
  );
  const byCode = groupTxByCode(txs);
  const db = getDb();

  let applied = 0;
  let skippedInactive = 0;
  let skippedNoEntry = 0;
  let linesAdded = 0;

  for (const [code, codeTxs] of byCode) {
    if (isInactiveArrearsCode(code)) {
      skippedInactive += 1;
      continue;
    }

    const [entry] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code))
      .limit(1);
    if (!entry) {
      skippedNoEntry += 1;
      continue;
    }

    const existing = await listLetterLines(entry.id);
    const letterLines = existing.filter(
      l => l.source === 'letter' && !isPostCutoffLetterMonth(l.description, cutoffDate),
    );
    const junkCount = existing.length - letterLines.length;
    const letterDescs = letterLines.map(l => l.description);

    const base: ArrearsLetterLineInput[] = letterLines.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: 'letter',
    }));

    const existingKeys = new Set(base.map(lineDedupKey));
    const additions: ArrearsLetterLineInput[] = [];

    for (const tx of codeTxs) {
      const line = clientDetailTxToLineInput(tx, letterDescs);
      if (!line) continue;
      const key = lineDedupKey(line);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      additions.push(line);
      letterDescs.push(line.description);
    }

    if (!additions.length && junkCount === 0) continue;

    await replaceLetterLines(entry.id, actorName, [...base, ...additions], {
      syncBalance: false,
    });
    applied += 1;
    linesAdded += additions.length;
  }

  return {
    preview: false,
    cutoffDate,
    applied,
    skippedInactive,
    skippedNoEntry,
    linesAdded,
  };
}

export async function getImportConfigForApi() {
  return readArrearsImportConfig();
}

export function summarizeBalanceAlignment(
  balance: number,
  lines: Array<{ amount: number; paidAmount: number }>,
): { linesOpen: number; diff: number } {
  const linesOpen = letterBalanceFromLines(lines);
  return { linesOpen, diff: Math.round(balance) - linesOpen };
}

export { isArrearsBalanceLocked };

/** 공문 letter 줄 중 cutoff 월 이후 월별 기장료 — 거래처별 상세로 대체 */
function isPostCutoffLetterMonth(desc: string, cutoffDot: string): boolean {
  const d = String(desc || '').replace(/\s+/g, '');
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return false;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  const mo = Number(m[2]);
  const cut = toIsoDate(cutoffDot);
  const cy = Number(cut.slice(0, 4));
  const cm = Number(cut.slice(5, 7));
  if (y > cy) return true;
  if (y === cy && mo >= cm) return true;
  return false;
}
