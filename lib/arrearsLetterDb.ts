import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines } from '@/db/schema';
import type {
  ArrearsEntryDto,
  ArrearsLetterLineDto,
  ArrearsLetterLineInput,
  ArrearsLetterLineSource,
  ArrearsMgmtCategory,
} from '@/app/types/arrears';
import { letterBalanceFromLines, formatArrearsPaidDateKo } from '@/app/types/arrears';
import type { ParsedLetterLine, ParsedLetterSheet } from '@/lib/arrearsLetterParse';
import { letterLinesBalance } from '@/lib/arrearsLetterParse';
import type { ParsedFeeEvent } from '@/lib/arrearsFeeEventParse';
import { feeEventPaidDateLabel } from '@/lib/arrearsFeeEventParse';
import type { LedgerDetailCompany } from '@/lib/arrearsLedgerDetailParse';
import {
  ledgerDetailChargeDedupKey,
  ledgerDetailPaidDateLabel,
  isLetterCorpFeeDescription,
  inheritYearForMonthFeeDesc,
} from '@/lib/arrearsLedgerDetailParse';
import { getArrearsEntryById } from '@/lib/arrearsDb';
import {
  classifyBalanceDiff,
  type BalanceDiffKind,
} from '@/lib/arrearsBalanceDiff';

export type { BalanceDiffKind };
export { classifyBalanceDiff };

function toLineDto(row: typeof arrearsLetterLines.$inferSelect): ArrearsLetterLineDto {
  return {
    id: row.id,
    arrearsEntryId: row.arrearsEntryId,
    sortOrder: row.sortOrder,
    description: row.description,
    amount: row.amount,
    paidAmount: row.paidAmount,
    paidDate: formatArrearsPaidDateKo(row.paidDate),
    source: (row.source || 'manual') as ArrearsLetterLineSource,
  };
}

function toEntryDto(row: typeof arrearsEntries.$inferSelect): ArrearsEntryDto {
  return {
    id: row.id,
    clientId: row.clientId,
    externalCode: row.externalCode,
    companyName: row.companyName,
    businessNo: row.businessNo,
    representative: row.representative,
    balance: row.balance,
    carryIn: row.carryIn,
    debit: row.debit,
    credit: row.credit,
    managerName: row.managerName,
    mgmtCategory: (row.mgmtCategory || '') as ArrearsMgmtCategory,
    cmsNote: row.cmsNote,
    memo: row.memo,
    asOfDate: row.asOfDate,
    letterDate: row.letterDate || '',
    source: row.source,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt ?? ''),
  };
}

export function normCompanyName(s: string): string {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[＆&]/g, '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사/g, '(유)')
    .replace(/메거진/g, '매거진')
    .replace(/이앤지/g, '이엔지')
    .replace(/[()（）·・./\-]/g, '')
    .toLowerCase();
}

function softKey(s: string): string {
  return normCompanyName(s).replace(/원/g, '');
}

export async function listLetterLines(entryId: string): Promise<ArrearsLetterLineDto[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, entryId))
    .orderBy(asc(arrearsLetterLines.sortOrder), asc(arrearsLetterLines.createdAt));
  return rows.map(toLineDto);
}

export async function getArrearsLetterDetail(id: string): Promise<{
  item: ArrearsEntryDto;
  lines: ArrearsLetterLineDto[];
  letterBalance: number;
  balanceDiff: number;
} | null> {
  const item = await getArrearsEntryById(id);
  if (!item) return null;
  const lines = await listLetterLines(id);
  const letterBalance = letterBalanceFromLines(lines);
  return {
    item,
    lines,
    letterBalance,
    balanceDiff: item.balance - letterBalance,
  };
}

export async function replaceLetterLines(
  entryId: string,
  actorName: string,
  lines: ArrearsLetterLineInput[],
  opts?: { syncBalance?: boolean; letterDate?: string },
): Promise<{
  item: ArrearsEntryDto;
  lines: ArrearsLetterLineDto[];
  letterBalance: number;
  balanceDiff: number;
}> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.id, entryId))
    .limit(1);
  if (!existing) throw new Error('NOT_FOUND');

  const now = new Date();
  const actor = actorName.trim() || '';
  const normalized = lines
    .map((l, i) => ({
      description: String(l.description || '').trim(),
      amount: Math.round(Number(l.amount) || 0),
      paidAmount: Math.round(Number(l.paidAmount) || 0),
      paidDate: formatArrearsPaidDateKo(String(l.paidDate || '').trim()),
      source: (l.source || 'manual') as ArrearsLetterLineSource,
      sortOrder: i,
    }))
    // 지급-only 행(내역 비움) 허용 — 사무실 공문 양식과 동일
    .filter(l => l.description || l.amount || l.paidAmount);

  await db.delete(arrearsLetterLines).where(eq(arrearsLetterLines.arrearsEntryId, entryId));

  if (normalized.length) {
    await db.insert(arrearsLetterLines).values(
      normalized.map(l => ({
        arrearsEntryId: entryId,
        sortOrder: l.sortOrder,
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  const letterBalance = letterBalanceFromLines(normalized);
  const updates: Partial<typeof arrearsEntries.$inferInsert> = {
    updatedBy: actor,
    updatedAt: now,
  };
  if (opts?.letterDate !== undefined) {
    updates.letterDate = opts.letterDate.trim();
  }
  if (opts?.syncBalance !== false) {
    updates.balance = letterBalance;
    updates.source = 'manual';
  }

  const [row] = await db
    .update(arrearsEntries)
    .set(updates)
    .where(eq(arrearsEntries.id, entryId))
    .returning();

  const saved = await listLetterLines(entryId);
  const item = toEntryDto(row);
  return {
    item,
    lines: saved,
    letterBalance,
    balanceDiff: item.balance - letterBalance,
  };
}

export async function appendLetterLine(
  entryId: string,
  actorName: string,
  line: {
    description: string;
    amount: number;
    paidAmount?: number;
    paidDate?: string;
    source?: ArrearsLetterLineSource;
  },
  opts?: { syncBalance?: boolean },
): Promise<{
  item: ArrearsEntryDto;
  lines: ArrearsLetterLineDto[];
  letterBalance: number;
  balanceDiff: number;
}> {
  const existing = await listLetterLines(entryId);
  return replaceLetterLines(
    entryId,
    actorName,
    [
      ...existing.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source,
      })),
      {
        description: line.description,
        amount: line.amount,
        paidAmount: line.paidAmount ?? 0,
        paidDate: line.paidDate ?? '',
        source: line.source ?? 'manual',
      },
    ],
    { syncBalance: opts?.syncBalance },
  );
}

/** 원장 잔액과 공문 잔액 차이를 ledger 라인으로 맞춤 */
export async function syncLetterDiffWithLedger(
  entryId: string,
  ledgerBalance: number,
  asOfDate: string,
  actorName: string,
): Promise<{ applied: boolean; diff: number }> {
  const lines = await listLetterLines(entryId);
  const labelDate = asOfDate || new Date().toISOString().slice(0, 10);
  const bal = Math.round(ledgerBalance);

  // 공문 없음 + 원장 잔액 있음 → 「전기이월」한 줄만 (상세 공문 대체 아님)
  if (!lines.length) {
    if (bal === 0) return { applied: false, diff: 0 };
    await replaceLetterLines(
      entryId,
      actorName,
      [
        {
          description: `전기이월 (${labelDate})`,
          amount: bal > 0 ? bal : 0,
          paidAmount: bal < 0 ? Math.abs(bal) : 0,
          paidDate: '',
          source: 'ledger',
        },
      ],
      { syncBalance: false },
    );
    return { applied: true, diff: bal };
  }

  const isSyncLine = (desc: string, source: string) =>
    source === 'ledger' &&
    (desc.includes('원장 추가미수') ||
      desc.includes('원장 입금 반영') ||
      desc.includes('원장 잔액') ||
      desc.includes('원장반영') ||
      desc.includes('전기이월') ||
      desc.includes(`(${labelDate})`));

  const keep = lines.filter(l => !isSyncLine(l.description, l.source));
  const base = letterBalanceFromLines(keep);
  const need = bal - base;
  const before = letterBalanceFromLines(lines);
  const diff = bal - before;

  const next = keep.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate,
    source: l.source,
  }));

  if (need !== 0) {
    if (need > 0) {
      next.push({
        description: `원장반영 (${labelDate})`,
        amount: need,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      });
    } else {
      next.push({
        description: `원장반영 입금 (${labelDate})`,
        amount: 0,
        paidAmount: Math.abs(need),
        paidDate: '',
        source: 'ledger',
      });
    }
  }

  if (need === 0 && diff === 0) {
    return { applied: false, diff: 0 };
  }

  await replaceLetterLines(entryId, actorName, next, { syncBalance: false });
  return { applied: need !== 0 || diff !== 0, diff: need };
}

/** 완전 동일(정규화)만 매칭 — 부분일치/포함은 찰리 수동 연결로 */
function findEntryByCompanyName<
  T extends { id: string; companyName: string; externalCode: string },
>(entries: T[], sheetName: string): T | null {
  const key = softKey(sheetName);
  if (!key) return null;
  const hits = entries.filter(e => softKey(e.companyName) === key);
  return hits.length === 1 ? hits[0]! : null;
}

export type LetterImportPreviewSheet = {
  companyName: string;
  letterDate: string;
  lineCount: number;
  letterBalance: number;
  matched: boolean;
  entryId: string | null;
  matchedCompanyName: string | null;
  externalCode: string | null;
  currentBalance: number | null;
};

export async function previewLetterImport(
  sheets: ParsedLetterSheet[],
  managerName: string,
): Promise<{
  sheets: LetterImportPreviewSheet[];
  matched: number;
  unmatched: number;
  totalLines: number;
}> {
  const db = getDb();
  const all = await db
    .select({
      id: arrearsEntries.id,
      companyName: arrearsEntries.companyName,
      externalCode: arrearsEntries.externalCode,
      balance: arrearsEntries.balance,
      managerName: arrearsEntries.managerName,
    })
    .from(arrearsEntries);

  const pool = managerName.trim()
    ? all.filter(e => e.managerName === managerName.trim() || !e.managerName)
    : all;

  let matched = 0;
  let unmatched = 0;
  let totalLines = 0;
  const out: LetterImportPreviewSheet[] = [];

  for (const sheet of sheets) {
    const hit = findEntryByCompanyName(pool, sheet.companyName)
      ?? findEntryByCompanyName(all, sheet.companyName);
    const letterBalance = letterLinesBalance(sheet.lines);
    totalLines += sheet.lines.length;
    if (hit) matched += 1;
    else unmatched += 1;
    out.push({
      companyName: sheet.companyName,
      letterDate: sheet.letterDate,
      lineCount: sheet.lines.length,
      letterBalance,
      matched: !!hit,
      entryId: hit?.id ?? null,
      matchedCompanyName: hit?.companyName ?? null,
      externalCode: hit?.externalCode ?? null,
      currentBalance: hit?.balance ?? null,
    });
  }

  return { sheets: out, matched, unmatched, totalLines };
}

/**
 * 매칭된 시트 내역을 교체 저장.
 * unmatchedCreate=true면 미매칭 상호로 새 arrears_entries 생성 후 저장.
 */
export async function upsertLetterImport(
  sheets: ParsedLetterSheet[],
  managerName: string,
  actorName: string,
  opts?: { unmatchedCreate?: boolean; syncBalance?: boolean },
): Promise<{
  updated: number;
  created: number;
  skipped: number;
  totalLines: number;
}> {
  const db = getDb();
  const all = await db
    .select({
      id: arrearsEntries.id,
      companyName: arrearsEntries.companyName,
      externalCode: arrearsEntries.externalCode,
      managerName: arrearsEntries.managerName,
    })
    .from(arrearsEntries);

  const now = new Date();
  const actor = actorName.trim() || '';
  let updated = 0;
  let created = 0;
  let skipped = 0;
  let totalLines = 0;

  for (const sheet of sheets) {
    let hit = findEntryByCompanyName(all, sheet.companyName);
    if (!hit && opts?.unmatchedCreate) {
      const code = `letter:${normCompanyName(sheet.companyName) || Date.now()}`;
      const [row] = await db
        .insert(arrearsEntries)
        .values({
          clientId: null,
          externalCode: code.slice(0, 80),
          companyName: sheet.companyName,
          businessNo: '',
          representative: '',
          balance: letterLinesBalance(sheet.lines),
          carryIn: 0,
          debit: 0,
          credit: 0,
          managerName: managerName || '',
          mgmtCategory: '',
          cmsNote: '',
          memo: '',
          asOfDate: sheet.letterDate.replace(/\./g, '-') || '',
          letterDate: sheet.letterDate,
          source: 'letter',
          updatedBy: actor,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      hit = {
        id: row.id,
        companyName: row.companyName,
        externalCode: row.externalCode,
        managerName: managerName || '',
      };
      all.push(hit);
      created += 1;
    }

    if (!hit) {
      skipped += 1;
      continue;
    }

    const inputs: ArrearsLetterLineInput[] = sheet.lines.map((l: ParsedLetterLine) => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: 'letter' as const,
    }));
    totalLines += inputs.length;

    await replaceLetterLines(hit.id, actor, inputs, {
      syncBalance: opts?.syncBalance !== false,
      letterDate: sheet.letterDate,
    });

    if (managerName.trim()) {
      const [cur] = await db
        .select({ managerName: arrearsEntries.managerName })
        .from(arrearsEntries)
        .where(eq(arrearsEntries.id, hit.id))
        .limit(1);
      if (cur && !cur.managerName.trim()) {
        await db
          .update(arrearsEntries)
          .set({ managerName: managerName.trim(), updatedAt: now })
          .where(eq(arrearsEntries.id, hit.id));
      }
    }

    updated += 1;
  }

  return { updated, created, skipped, totalLines };
}

/** 원장 미리보기용: 기존 DB 행의 공문잔액과 원장잔액 차이 */
export async function previewLedgerLetterDiffs(
  ledgerRows: Array<{ externalCode: string; balance: number; companyName: string }>,
): Promise<{
  letterDiffCount: number;
  sample: Array<{
    externalCode: string;
    companyName: string;
    ledgerBalance: number;
    letterBalance: number;
    diff: number;
  }>;
}> {
  const db = getDb();
  const codes = ledgerRows.map(r => r.externalCode).filter(Boolean);
  if (!codes.length) return { letterDiffCount: 0, sample: [] };

  const entries = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      companyName: arrearsEntries.companyName,
    })
    .from(arrearsEntries);

  const byCode = new Map(entries.map(e => [e.externalCode, e]));
  const entryIds = entries.map(e => e.id);
  const balByEntry = new Map<string, number>();
  if (entryIds.length) {
    const sums = await db
      .select({
        arrearsEntryId: arrearsLetterLines.arrearsEntryId,
        total: sql<number>`coalesce(sum(${arrearsLetterLines.amount} - ${arrearsLetterLines.paidAmount}), 0)`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(arrearsLetterLines)
      .groupBy(arrearsLetterLines.arrearsEntryId);
    for (const s of sums) {
      if (Number(s.cnt) > 0) balByEntry.set(s.arrearsEntryId, Number(s.total) || 0);
    }
  }

  const sample: Array<{
    externalCode: string;
    companyName: string;
    ledgerBalance: number;
    letterBalance: number;
    diff: number;
  }> = [];
  let letterDiffCount = 0;

  for (const r of ledgerRows) {
    const ent = byCode.get(r.externalCode);
    if (!ent) continue;
    const hasLines = balByEntry.has(ent.id);
    const letterBalance = hasLines ? (balByEntry.get(ent.id) ?? 0) : 0;
    // 공문 없고 원장 잔액 0이면 스킵
    if (!hasLines && Math.round(r.balance) === 0) continue;
    const diff = Math.round(r.balance) - letterBalance;
    if (hasLines && diff === 0) continue;
    // 공문 없으면 전체 잔액이 "신규 반영" 대상
    if (!hasLines && Math.round(r.balance) === 0) continue;
    letterDiffCount += 1;
    if (sample.length < 20) {
      sample.push({
        externalCode: r.externalCode,
        companyName: r.companyName || ent.companyName,
        ledgerBalance: r.balance,
        letterBalance: hasLines ? letterBalance : 0,
        diff: hasLines ? diff : Math.round(r.balance),
      });
    }
  }

  return { letterDiffCount, sample };
}

export async function applyLedgerLetterDiffsForCodes(
  ledgerRows: Array<{ externalCode: string; balance: number }>,
  asOfDate: string,
  actorName: string,
): Promise<{ applied: number }> {
  const db = getDb();
  const entries = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
    })
    .from(arrearsEntries);
  const byCode = new Map(entries.map(e => [e.externalCode, e]));

  let applied = 0;
  for (const r of ledgerRows) {
    const ent = byCode.get(r.externalCode);
    if (!ent) continue;
    const result = await syncLetterDiffWithLedger(ent.id, r.balance, asOfDate, actorName);
    if (result.applied) applied += 1;
  }
  return { applied };
}

export type FeeEventPreviewRow = ParsedFeeEvent & {
  matched: boolean;
  entryId: string | null;
  matchedCompanyName: string | null;
  externalCodeMatched: string | null;
};

/** 세금계산서·CMS·미수/입금 이벤트 → 공문 라인 append 미리보기 */
export async function previewFeeEvents(events: ParsedFeeEvent[]): Promise<{
  rows: FeeEventPreviewRow[];
  matched: number;
  unmatched: number;
}> {
  const db = getDb();
  const entries = await db
    .select({
      id: arrearsEntries.id,
      companyName: arrearsEntries.companyName,
      externalCode: arrearsEntries.externalCode,
      businessNo: arrearsEntries.businessNo,
    })
    .from(arrearsEntries);

  const byCode = new Map(entries.map(e => [e.externalCode, e]));
  const byBiz = new Map<string, (typeof entries)[0]>();
  for (const e of entries) {
    const biz = String(e.businessNo || '').replace(/\D/g, '');
    if (biz.length === 10 && !byBiz.has(biz)) byBiz.set(biz, e);
  }

  let matched = 0;
  let unmatched = 0;
  const rows: FeeEventPreviewRow[] = [];

  for (const ev of events) {
    const hit =
      (ev.externalCode && byCode.get(ev.externalCode)) ||
      (ev.businessNo && byBiz.get(ev.businessNo)) ||
      findEntryByCompanyName(entries, ev.companyName);

    if (hit) matched += 1;
    else unmatched += 1;

    rows.push({
      ...ev,
      matched: !!hit,
      entryId: hit?.id ?? null,
      matchedCompanyName: hit?.companyName ?? null,
      externalCodeMatched: hit?.externalCode ?? null,
    });
  }

  return { rows, matched, unmatched };
}

/** 매칭된 이벤트를 공문 라인에 append (동일 행 재업로드 시 skip) */
export async function applyFeeEvents(
  events: ParsedFeeEvent[],
  actorName: string,
  opts?: {
    /** false면 원장 잔액 유지 (세금계산서 매출 내역만 추가). 기본 true */
    syncBalance?: boolean;
    /**
     * 세금계산서(청구) 추가분만큼 「원장반영」 등 원장 맞춤 줄의 amount를 줄여
     * 이중계상을 상계. syncBalance false와 함께 쓰는 것을 권장.
     */
    netAgainstLedgerRef?: boolean;
    /**
     * A규칙: 기존 내역에 동일 청구 금액(amount>0)이 있으면 세금계산서 등 청구 이벤트를 스킵.
     * 입금(paidAmount만) 줄은 청구 중복으로 보지 않음.
     */
    skipIfSameOpenAmount?: boolean;
    /**
     * 1-B: PDF(ledger/payment)가 이미 있는 업체는 같은 월·성격(기장/조정/성실) 금액을 tax에서 스킵.
     * PDF 공백(해당 키 없음)만 보충.
     */
    skipIfPdfCovered?: boolean;
  },
): Promise<{
  applied: number;
  skipped: number;
  entryCount: number;
  duplicates: number;
  skippedSameAmount: number;
  skippedPdfCovered: number;
  netted: number;
  nettedAmount: number;
}> {
  const syncBalance = opts?.syncBalance !== false;
  const netAgainstLedgerRef = opts?.netAgainstLedgerRef === true;
  const skipIfSameOpenAmount = opts?.skipIfSameOpenAmount === true;
  const skipIfPdfCovered = opts?.skipIfPdfCovered === true;
  const preview = await previewFeeEvents(events);
  const byEntry = new Map<
    string,
    Array<{
      description: string;
      amount: number;
      paidAmount: number;
      paidDate: string;
      source: ArrearsLetterLineSource;
    }>
  >();

  let skipped = 0;
  for (const row of preview.rows) {
    if (!row.entryId) {
      skipped += 1;
      continue;
    }
    const list = byEntry.get(row.entryId) ?? [];
    const paidDate = feeEventPaidDateLabel(row.eventDate);
    const source: ArrearsLetterLineSource =
      row.kind === 'cms'
        ? 'cms'
        : row.kind === 'payment'
          ? 'payment'
          : row.kind === 'tax_invoice'
            ? 'tax'
            : 'manual';
    if (row.isPayment) {
      list.push({
        description: row.isNew ? `신규 · ${row.description}` : row.description,
        amount: 0,
        paidAmount: row.amount,
        paidDate,
        source,
      });
    } else {
      list.push({
        description: row.isNew ? `신규 · ${row.description}` : row.description,
        amount: row.amount,
        paidAmount: 0,
        paidDate: '',
        source,
      });
    }
    byEntry.set(row.entryId, list);
  }

  let applied = 0;
  let duplicates = 0;
  let skippedSameAmount = 0;
  let skippedPdfCovered = 0;
  let netted = 0;
  let nettedAmount = 0;
  let entryTouched = 0;
  for (const [entryId, additions] of byEntry) {
    const existing = await listLetterLines(entryId);
    const seen = new Set(
      existing.map(
        l =>
          `${l.description.trim()}|${Math.round(l.amount)}|${Math.round(l.paidAmount)}|${String(l.paidDate || '').trim()}`,
      ),
    );
    /** 기존 청구 금액 멀티셋 — A규칙용 */
    const openAmountCounts = new Map<number, number>();
    if (skipIfSameOpenAmount) {
      for (const l of existing) {
        const amt = Math.round(l.amount);
        if (amt <= 0) continue;
        openAmountCounts.set(amt, (openAmountCounts.get(amt) || 0) + 1);
      }
    }
    const hasPdfDetail = existing.some(l => l.source === 'ledger' || l.source === 'payment');
    const chargeDedupKeys = new Set(
      existing
        .filter(l => Math.round(l.amount) > 0)
        .map(l => ledgerDetailChargeDedupKey(l.description, l.amount)),
    );

    const uniqueAdds = additions.filter(a => {
      const key = `${a.description.trim()}|${Math.round(a.amount)}|${Math.round(a.paidAmount)}|${String(a.paidDate || '').trim()}`;
      if (seen.has(key)) {
        duplicates += 1;
        return false;
      }
      if (
        skipIfPdfCovered &&
        hasPdfDetail &&
        a.source === 'tax' &&
        Math.round(a.amount) > 0
      ) {
        const dedup = ledgerDetailChargeDedupKey(a.description, a.amount);
        if (chargeDedupKeys.has(dedup)) {
          skippedPdfCovered += 1;
          return false;
        }
      }
      if (skipIfSameOpenAmount && Math.round(a.amount) > 0) {
        const amt = Math.round(a.amount);
        const left = openAmountCounts.get(amt) || 0;
        if (left > 0) {
          openAmountCounts.set(amt, left - 1);
          skippedSameAmount += 1;
          return false;
        }
      }
      seen.add(key);
      if (Math.round(a.amount) > 0) {
        chargeDedupKeys.add(ledgerDetailChargeDedupKey(a.description, a.amount));
      }
      return true;
    });
    if (!uniqueAdds.length) continue;
    entryTouched += 1;

    const merged = [
      ...existing.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source as ArrearsLetterLineSource,
      })),
      ...uniqueAdds,
    ];

    // 세금계산서 청구분 ↔ 원장반영 청구분 상계 (이중계상 방지)
    if (netAgainstLedgerRef) {
      let taxCharge = uniqueAdds
        .filter(a => a.source === 'tax' && a.amount > 0)
        .reduce((s, a) => s + Math.round(a.amount), 0);
      if (taxCharge > 0) {
        for (const line of merged) {
          if (taxCharge <= 0) break;
          if (line.source !== 'ledger' && !isLedgerRefLike(line.description)) continue;
          const open = Math.round(line.amount) - Math.round(line.paidAmount || 0);
          if (open <= 0) continue;
          const take = Math.min(open, taxCharge);
          line.amount = Math.round(line.amount) - take;
          taxCharge -= take;
          netted += 1;
          nettedAmount += take;
        }
        // amount·paid 모두 0이 된 원장반영 줄은 제거
        for (let i = merged.length - 1; i >= 0; i--) {
          const l = merged[i]!;
          if (
            (l.source === 'ledger' || isLedgerRefLike(l.description)) &&
            Math.round(l.amount) === 0 &&
            Math.round(l.paidAmount || 0) === 0
          ) {
            merged.splice(i, 1);
          }
        }
      }
    }

    await replaceLetterLines(entryId, actorName, merged, { syncBalance });
    applied += uniqueAdds.length;
  }

  return {
    applied,
    skipped,
    entryCount: entryTouched,
    duplicates,
    skippedSameAmount,
    skippedPdfCovered,
    netted,
    nettedAmount,
  };
}

/** 세금계산서(tax) 출처 내역 줄 제거 — 공급+세액 재반영 전 */
export async function stripTaxInvoiceLetterLines(actorName: string): Promise<{
  entries: number;
  removed: number;
}> {
  const db = getDb();
  const rows = await db.select({ id: arrearsEntries.id }).from(arrearsEntries);
  let entries = 0;
  let removed = 0;
  for (const { id } of rows) {
    const existing = await listLetterLines(id);
    const kept = existing.filter(l => l.source !== 'tax');
    if (kept.length === existing.length) continue;
    removed += existing.length - kept.length;
    entries += 1;
    await replaceLetterLines(
      id,
      actorName,
      kept.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
  }
  return { entries, removed };
}

/**
 * 거래처원장 2026 상세(차변=청구, 대변=입금) 반영.
 * 잔액 컬럼은 유지.
 * - 청구: 적요 정규화 키(월기장·조정·성실) 또는 적요|금액 중복 스킵
 * - 입금: 입금액+지급일 중복 스킵 (공문 행에 붙은 동일 입금·일자 포함)
 * - 신고대리형(잔액0·공문없음·대변 다수/차변 거의없음)은 스킵
 */
export async function applyLedgerDetailTxs(
  companies: LedgerDetailCompany[],
  actorName: string,
): Promise<{
  applied: number;
  skippedDup: number;
  unmatchedCode: number;
  skippedAgentLike: number;
  entryCount: number;
  debitApplied: number;
  creditApplied: number;
}> {
  const db = getDb();
  const entries = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      balance: arrearsEntries.balance,
    })
    .from(arrearsEntries);
  const byCode = new Map(entries.map(e => [e.externalCode, e]));

  let applied = 0;
  let skippedDup = 0;
  let unmatchedCode = 0;
  let skippedAgentLike = 0;
  let entryCount = 0;
  let debitApplied = 0;
  let creditApplied = 0;

  for (const co of companies) {
    const ent = byCode.get(co.externalCode);
    if (!ent) {
      unmatchedCode += 1;
      continue;
    }
    if (!co.txs.length) continue;

    const existing = await listLetterLines(ent.id);
    const hasLetter = existing.some(l => l.source === 'letter');

    // 공문만으로 원장잔액이 이미 맞으면 PDF(전기이월·취소 포함) 추가 금지
    if (hasLetter) {
      const letterOpen = letterBalanceFromLines(
        existing.filter(l => l.source === 'letter'),
      );
      if (letterOpen === Math.round(ent.balance)) {
        skippedDup += 1;
        continue;
      }
    }

    const pdfDebits = co.txs.filter(t => t.kind === 'debit').length;
    const pdfCredits = co.txs.filter(t => t.kind === 'credit').length;
    if (
      !hasLetter &&
      Math.round(ent.balance) === 0 &&
      pdfCredits >= 10 &&
      pdfDebits <= 2
    ) {
      skippedAgentLike += 1;
      continue;
    }

    const chargeKeys = new Set<string>();
    /** 일자 없는「부가세|금액」— PDF 첫 번째 동액 부가세만 흡수하고, 이후 월은 추가 */
    const undatedVatRemain = new Map<string, number>();
    for (let i = 0; i < existing.length; i++) {
      const l = existing[i];
      if (Math.round(l.amount) <= 0) continue;
      const prev = i > 0 ? existing[i - 1].description : '';
      const desc = inheritYearForMonthFeeDesc(l.description, prev);
      const key = ledgerDetailChargeDedupKey(desc, l.amount);
      chargeKeys.add(key);
      if (/^부가세\|/.test(key)) {
        undatedVatRemain.set(key, (undatedVatRemain.get(key) || 0) + 1);
      }
    }
    // 공문 법인세·세무조정 금액 → PDF 법인조정료와 같은 키로 막아 중복 반영 방지
    for (const l of existing) {
      if (l.source !== 'letter' || Math.round(l.amount) <= 0) continue;
      if (!isLetterCorpFeeDescription(l.description)) continue;
      chargeKeys.add(`법인조정|${Math.round(l.amount)}`);
    }
    /** 동일 금액·일자 입금이 여러 건일 수 있음(우리펌프카 7/24 220만×2) → 건수 차감 */
    const payKeyRemain = new Map<string, number>();
    /** 공문에 입금액만 있고 일자가 비어 있으면 PDF 동액 크레딧(취소·입금) 1건으로 흡수 */
    const undatedPayRemain = new Map<number, number>();
    const bumpPay = (key: string, n = 1) => {
      payKeyRemain.set(key, (payKeyRemain.get(key) || 0) + n);
    };
    for (const l of existing) {
      const p = Math.round(l.paidAmount) || 0;
      if (p <= 0) continue;
      const pd = String(l.paidDate || '').trim();
      if (pd) bumpPay(`${p}|${pd}`);
      else undatedPayRemain.set(p, (undatedPayRemain.get(p) || 0) + 1);
    }
    // 공문에 기장·기타를 같은 날 각각 입금 처리한 경우, 합산액도 PDF 입금 중복으로 본다
    const paidSumByDate = new Map<string, number>();
    for (const l of existing) {
      const pd = String(l.paidDate || '').trim();
      const p = Math.round(l.paidAmount) || 0;
      if (!pd || p <= 0) continue;
      paidSumByDate.set(pd, (paidSumByDate.get(pd) || 0) + p);
    }
    for (const [pd, sum] of paidSumByDate) {
      // 개별 합과 동일하면 이미 bump된 키와 중복 카운트되므로, 구성 건이 2개 이상일 때만
      const parts = existing.filter(
        l =>
          String(l.paidDate || '').trim() === pd &&
          (Math.round(l.paidAmount) || 0) > 0,
      );
      if (parts.length >= 2 && sum > 0) bumpPay(`${sum}|${pd}`);
    }

    const additions: Array<{
      description: string;
      amount: number;
      paidAmount: number;
      paidDate: string;
      source: ArrearsLetterLineSource;
    }> = [];

    for (const tx of co.txs) {
      const amt = Math.round(tx.amount);
      if (amt <= 0) continue;
      if (tx.kind === 'debit') {
        const desc = (tx.description || '외상매출').trim();
        // 공문이 있으면 전기이월은 이미 공문 이력에 포함 → 이중 가산 금지
        if (hasLetter && /^전기이월/.test(desc)) {
          skippedDup += 1;
          continue;
        }
        const key = ledgerDetailChargeDedupKey(desc, amt, tx.eventDate);
        if (chargeKeys.has(key)) {
          skippedDup += 1;
          continue;
        }
        // 기존 일자없는 부가세|금액 1건 → PDF 첫 동액 부가세(월 포함키)로 소진
        const undatedVat = key.replace(/^부가세:\d{4}-\d{2}/, '부가세');
        if (
          undatedVat !== key &&
          /^부가세\|/.test(undatedVat) &&
          (undatedVatRemain.get(undatedVat) || 0) > 0
        ) {
          undatedVatRemain.set(
            undatedVat,
            (undatedVatRemain.get(undatedVat) || 0) - 1,
          );
          chargeKeys.add(key);
          skippedDup += 1;
          continue;
        }
        chargeKeys.add(key);
        additions.push({
          description: desc,
          amount: amt,
          paidAmount: 0,
          paidDate: '',
          source: 'ledger',
        });
        debitApplied += 1;
      } else {
        const paidDate = ledgerDetailPaidDateLabel(tx.eventDate);
        const key = `${amt}|${paidDate}`;
        const remain = payKeyRemain.get(key) || 0;
        if (remain > 0) {
          payKeyRemain.set(key, remain - 1);
          skippedDup += 1;
          continue;
        }
        const undatedRemain = undatedPayRemain.get(amt) || 0;
        if (undatedRemain > 0) {
          undatedPayRemain.set(amt, undatedRemain - 1);
          skippedDup += 1;
          continue;
        }
        // 동일 금액·일자라도 원장에 N건이면 N건 반영(기존 건수 소진 후에만 추가)
        additions.push({
          description: (tx.description || '입금').trim() || '입금',
          amount: 0,
          paidAmount: amt,
          paidDate,
          source: 'payment',
        });
        creditApplied += 1;
      }
    }

    if (!additions.length) continue;
    entryCount += 1;
    const merged = [
      ...existing.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source as ArrearsLetterLineSource,
      })),
      ...additions,
    ];
    await replaceLetterLines(ent.id, actorName, merged, { syncBalance: false });
    applied += additions.length;
  }

  return {
    applied,
    skippedDup,
    unmatchedCode,
    skippedAgentLike,
    entryCount,
    debitApplied,
    creditApplied,
  };
}

function isLedgerRefLike(desc: string): boolean {
  const d = String(desc || '');
  return (
    d.includes('원장반영') ||
    d.includes('원장 추가미수') ||
    d.includes('원장 입금') ||
    d.includes('원장 잔액') ||
    /^전기이월/.test(d)
  );
}

/** 자동 잔액맞춤용 「원장반영」·전기이월 플러그 줄 제거 (잔액 컬럼은 유지) */
export async function stripLedgerSyncLetterLines(actorName: string): Promise<{
  entries: number;
  removed: number;
}> {
  const db = getDb();
  const rows = await db.select({ id: arrearsEntries.id }).from(arrearsEntries);
  let entries = 0;
  let removed = 0;
  for (const { id } of rows) {
    const existing = await listLetterLines(id);
    const kept = existing.filter(
      l => !(l.source === 'ledger' && isLedgerRefLike(l.description)),
    );
    if (kept.length === existing.length) continue;
    removed += existing.length - kept.length;
    entries += 1;
    await replaceLetterLines(
      id,
      actorName,
      kept.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
  }
  return { entries, removed };
}

/**
 * 원장만(공문 없음·내역합 0·잔액≠0) 업체에 전기이월 차변을 넣어 내역=원장잔액으로 맞춤.
 * PDF로 올해 상쇄된 뒤에도 남는 장기미수 잔액을 받을 금액으로 표시.
 */
export async function applyLedgerOnlyCarryIn(
  actorName: string,
  asOfDate?: string,
): Promise<{ applied: number; entryCount: number; totalAmount: number }> {
  const labelDate = (asOfDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const { items } = await listLedgerBalanceMismatches({ kind: 'ledger_only' });

  let applied = 0;
  let entryCount = 0;
  let totalAmount = 0;

  for (const m of items) {
    const existing = await listLetterLines(m.entryId);
    const keep = existing.filter(
      l => !(l.source === 'ledger' && /^전기이월/.test(l.description)),
    );
    const open = letterBalanceFromLines(keep);
    const need = Math.round(m.ledgerBalance) - open;
    if (need === 0) continue;

    const carryLine = {
      description: `전기이월 (${labelDate})`,
      amount: need > 0 ? need : 0,
      paidAmount: need < 0 ? Math.abs(need) : 0,
      paidDate: '',
      source: 'ledger' as ArrearsLetterLineSource,
    };
    const merged = [
      carryLine,
      ...keep.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: l.source as ArrearsLetterLineSource,
      })),
    ];
    await replaceLetterLines(m.entryId, actorName, merged, { syncBalance: false });
    applied += 1;
    entryCount += 1;
    totalAmount += need;
  }

  return { applied, entryCount, totalAmount };
}

export type LedgerBalanceMismatch = {
  entryId: string;
  companyName: string;
  externalCode: string;
  ledgerBalance: number;
  linesOpen: number;
  /** 원장잔액 − 내역미결합 */
  diff: number;
  /** mismatch=진짜 불일치, ledger_only=장기미수(원장만) */
  kind: 'mismatch' | 'ledger_only';
};

/** 원장 잔액 ≠ 내역(amount−paid) 합계인 업체 목록 */
export async function listLedgerBalanceMismatches(opts?: {
  limit?: number;
  /** 기본 mismatch만. 'all'이면 장기미수 포함, 'ledger_only'면 장기미수만 */
  kind?: 'mismatch' | 'ledger_only' | 'all';
}): Promise<{
  count: number;
  mismatchCount: number;
  ledgerOnlyCount: number;
  items: LedgerBalanceMismatch[];
}> {
  const db = getDb();
  const entries = await db
    .select({
      id: arrearsEntries.id,
      companyName: arrearsEntries.companyName,
      externalCode: arrearsEntries.externalCode,
      balance: arrearsEntries.balance,
    })
    .from(arrearsEntries);

  const sums = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      total: sql<number>`coalesce(sum(${arrearsLetterLines.amount} - ${arrearsLetterLines.paidAmount}), 0)`,
      cnt: sql<number>`count(*)::int`,
      hasLetter: sql<boolean>`bool_or(${arrearsLetterLines.source} = 'letter')`,
    })
    .from(arrearsLetterLines)
    .groupBy(arrearsLetterLines.arrearsEntryId);

  const openByEntry = new Map<string, number>();
  const hasLetterByEntry = new Map<string, boolean>();
  for (const s of sums) {
    if (Number(s.cnt) > 0) openByEntry.set(s.arrearsEntryId, Math.round(Number(s.total) || 0));
    hasLetterByEntry.set(s.arrearsEntryId, Boolean(s.hasLetter));
  }

  const all: LedgerBalanceMismatch[] = [];
  for (const e of entries) {
    const linesOpen = openByEntry.get(e.id) ?? 0;
    const ledgerBalance = Math.round(e.balance);
    const diff = ledgerBalance - linesOpen;
    if (diff === 0) continue;
    // 내역 없고 원장 잔액 0 → 불일치 아님
    if (!openByEntry.has(e.id) && ledgerBalance === 0) continue;
    const hasLetter = hasLetterByEntry.get(e.id) === true;
    const kind = classifyBalanceDiff({ ledgerBalance, linesOpen, hasLetter });
    if (kind === 'ok') continue;
    all.push({
      entryId: e.id,
      companyName: e.companyName,
      externalCode: e.externalCode,
      ledgerBalance,
      linesOpen,
      diff,
      kind,
    });
  }

  all.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const mismatchCount = all.filter(i => i.kind === 'mismatch').length;
  const ledgerOnlyCount = all.filter(i => i.kind === 'ledger_only').length;
  const kindFilter = opts?.kind ?? 'mismatch';
  const filtered =
    kindFilter === 'all' ? all : all.filter(i => i.kind === kindFilter);
  const limit = opts?.limit;
  return {
    count: filtered.length,
    mismatchCount,
    ledgerOnlyCount,
    items: limit != null ? filtered.slice(0, limit) : filtered,
  };
}

