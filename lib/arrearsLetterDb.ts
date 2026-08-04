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
import { letterBalanceFromLines } from '@/app/types/arrears';
import type { ParsedLetterLine, ParsedLetterSheet } from '@/lib/arrearsLetterParse';
import { letterLinesBalance } from '@/lib/arrearsLetterParse';
import type { ParsedFeeEvent } from '@/lib/arrearsFeeEventParse';
import { feeEventPaidDateLabel } from '@/lib/arrearsFeeEventParse';
import { getArrearsEntryById } from '@/lib/arrearsDb';

function toLineDto(row: typeof arrearsLetterLines.$inferSelect): ArrearsLetterLineDto {
  return {
    id: row.id,
    arrearsEntryId: row.arrearsEntryId,
    sortOrder: row.sortOrder,
    description: row.description,
    amount: row.amount,
    paidAmount: row.paidAmount,
    paidDate: row.paidDate,
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
  const normalized = lines.map((l, i) => ({
    description: String(l.description || '').trim(),
    amount: Math.round(Number(l.amount) || 0),
    paidAmount: Math.round(Number(l.paidAmount) || 0),
    paidDate: String(l.paidDate || '').trim(),
    source: (l.source || 'manual') as ArrearsLetterLineSource,
    sortOrder: i,
  })).filter(l => l.description);

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

  // 공문 없음 + 원장 잔액 있음 → 초기 라인 생성
  if (!lines.length) {
    if (bal === 0) return { applied: false, diff: 0 };
    await replaceLetterLines(
      entryId,
      actorName,
      [
        {
          description: `원장 잔액 (${labelDate})`,
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
        description: `원장 추가미수 (${labelDate})`,
        amount: need,
        paidAmount: 0,
        paidDate: '',
        source: 'ledger',
      });
    } else {
      next.push({
        description: `원장 입금 반영 (${labelDate})`,
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

function findEntryByCompanyName<
  T extends { id: string; companyName: string; externalCode: string },
>(entries: T[], sheetName: string): T | null {
  const key = normCompanyName(sheetName);
  const soft = softKey(sheetName);
  const byName = new Map(entries.map(e => [normCompanyName(e.companyName), e]));
  const bySoft = new Map(entries.map(e => [softKey(e.companyName), e]));

  let hit = byName.get(key);
  if (hit) return hit;
  hit = bySoft.get(soft);
  if (hit) return hit;
  for (const [nk, row] of byName) {
    if (nk.includes(key) || key.includes(nk)) return row;
  }
  for (const [sk, row] of bySoft) {
    if (sk.includes(soft) || soft.includes(sk)) return row;
  }
  return null;
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

/** 매칭된 이벤트를 공문 라인에 append하고 잔액 동기화 */
export async function applyFeeEvents(
  events: ParsedFeeEvent[],
  actorName: string,
): Promise<{ applied: number; skipped: number; entryCount: number }> {
  const preview = await previewFeeEvents(events);
  const byEntry = new Map<
    string,
    Array<{
      description: string;
      amount: number;
      paidAmount: number;
      paidDate: string;
      source: 'manual';
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
    if (row.isPayment) {
      list.push({
        description: row.description,
        amount: 0,
        paidAmount: row.amount,
        paidDate,
        source: 'manual',
      });
    } else {
      list.push({
        description: row.description,
        amount: row.amount,
        paidAmount: 0,
        paidDate: '',
        source: 'manual',
      });
    }
    byEntry.set(row.entryId, list);
  }

  let applied = 0;
  for (const [entryId, additions] of byEntry) {
    const existing = await listLetterLines(entryId);
    await replaceLetterLines(
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
        ...additions,
      ],
      { syncBalance: true },
    );
    applied += additions.length;
  }

  return { applied, skipped, entryCount: byEntry.size };
}

