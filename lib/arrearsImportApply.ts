import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import {
  isArrearsBalanceLocked,
  isArrearsLetterProtected,
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
import { isIndieManagerName } from '@/lib/arrearsImportFilenames';
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
  categoryUpdated: number;
};

export type ClientDetailImportPreview = {
  preview: true;
  cutoffDate: string;
  companyCount: number;
  txCount: number;
  skippedIndieHint: string;
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
  skippedIndie: number;
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
  let categoryUpdated = 0;

  for (const row of parsed.rows) {
    // 잔액은 현황표 그대로 (하나비·오프라인 포함). 공문과 다르면 불일치 표시.
    const balance = row.balance;

    const [prev] = await db
      .select({
        id: arrearsEntries.id,
        mgmtCategory: arrearsEntries.mgmtCategory,
        managerName: arrearsEntries.managerName,
        cmsNote: arrearsEntries.cmsNote,
        memo: arrearsEntries.memo,
      })
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, row.externalCode))
      .limit(1);

    if (prev) {
      const patch: Partial<typeof arrearsEntries.$inferInsert> = {
        companyName: row.companyName,
        balance,
        carryIn: row.carryIn,
        debit: row.debit,
        credit: row.credit,
        asOfDate: asOfIso,
        source: 'status',
        updatedBy: actorName,
        updatedAt: new Date(),
      };
      if (row.managerName) patch.managerName = row.managerName;
      if (row.mgmtCategory && row.mgmtCategory !== (prev.mgmtCategory || '')) {
        patch.mgmtCategory = row.mgmtCategory;
        categoryUpdated += 1;
      }
      if (row.cmsNote) patch.cmsNote = row.cmsNote;
      if (row.memo) patch.memo = row.memo;

      await db
        .update(arrearsEntries)
        .set(patch)
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
      if (row.mgmtCategory) categoryUpdated += 1;
    }
  }

  writeArrearsImportConfig({ statusAsOfDate: asOfDate });

  // 기준일: 현황표에 없는 업체(인디 등)도 동일 기준일로
  await db
    .update(arrearsEntries)
    .set({ asOfDate: asOfIso, updatedBy: actorName, updatedAt: new Date() });

  const totalBalance = parsed.rows.reduce((s, r) => s + r.balance, 0);

  return { preview: false, asOfDate, updated, inserted, totalBalance, categoryUpdated };
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
    skippedIndieHint:
      '인디 담당은 이 파일에 없으며, 잔액은 현황표·상세는 기존 공문을 사용합니다.',
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
  let skippedIndie = 0;
  let skippedNoEntry = 0;
  let linesAdded = 0;

  for (const [code, codeTxs] of byCode) {
    if (isInactiveArrearsCode(code) || isArrearsLetterProtected(code)) {
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

    // 인디: 잔액은 현황표·상세는 기존 공문 — 거래처별 현황 반영 스킵
    if (isIndieManagerName(entry.managerName)) {
      skippedIndie += 1;
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
    skippedIndie,
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
