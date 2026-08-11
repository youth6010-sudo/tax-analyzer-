import { and, asc, desc, eq, gte, ilike, inArray, ne, or, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines, clients } from '@/db/schema';
import type { ArrearsEntryDto, ArrearsManagerTotal, ArrearsMgmtCategory } from '@/app/types/arrears';
import { normalizeBizNo } from '@/app/utils/filingCheck';
import type { LedgerArrearsRow } from '@/lib/arrearsLedgerParse';

function toDto(row: typeof arrearsEntries.$inferSelect): ArrearsEntryDto {
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
    reasonSummary: '—',
  };
}

/** entry별 최근 청구(금액>0) 설명 1~2개 → 사유 요약 */
async function attachReasonSummaries(items: ArrearsEntryDto[]): Promise<ArrearsEntryDto[]> {
  if (!items.length) return items;
  const db = getDb();
  const ids = items.map(i => i.id);
  const lines = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      description: arrearsLetterLines.description,
      amount: arrearsLetterLines.amount,
      sortOrder: arrearsLetterLines.sortOrder,
    })
    .from(arrearsLetterLines)
    .where(inArray(arrearsLetterLines.arrearsEntryId, ids))
    .orderBy(desc(arrearsLetterLines.sortOrder));

  const chargesByEntry = new Map<string, string[]>();
  for (const line of lines) {
    if (Math.round(line.amount) <= 0) continue;
    const desc = (line.description || '').trim();
    if (!desc) continue;
    const list = chargesByEntry.get(line.arrearsEntryId) ?? [];
    if (list.length >= 2) continue;
    if (!list.includes(desc)) list.push(desc);
    chargesByEntry.set(line.arrearsEntryId, list);
  }

  return items.map(item => {
    const charges = chargesByEntry.get(item.id);
    if (charges?.length) {
      return { ...item, reasonSummary: charges.join(' · ') };
    }
    const memo = (item.memo || '').trim();
    return { ...item, reasonSummary: memo || '—' };
  });
}

function normalizeCompanyName(name: string): string {
  return name.replace(/\s+/g, '').trim().toLowerCase();
}

export type ClientMatchIndex = {
  byBiz: Map<string, { id: string; companyName: string; manager: string }>;
  byName: Map<string, { id: string; companyName: string; manager: string }>;
};

export async function buildClientMatchIndex(): Promise<ClientMatchIndex> {
  const db = getDb();
  const rows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      businessNo: clients.businessNo,
      manager: clients.manager,
      status: clients.status,
    })
    .from(clients)
    .where(ne(clients.status, 'churned'));

  const byBiz = new Map<string, { id: string; companyName: string; manager: string }>();
  const byName = new Map<string, { id: string; companyName: string; manager: string }>();

  for (const r of rows) {
    const entry = {
      id: r.id,
      companyName: r.companyName,
      manager: (r.manager || '').trim(),
    };
    const biz = normalizeBizNo(r.businessNo);
    if (biz.length === 10 && !byBiz.has(biz)) {
      byBiz.set(biz, entry);
    }
    const nameKey = normalizeCompanyName(r.companyName);
    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, entry);
    }
  }

  return { byBiz, byName };
}

export function matchClientForArrears(
  index: ClientMatchIndex,
  businessNo: string,
  companyName: string,
): { id: string; companyName: string; manager: string } | null {
  const biz = normalizeBizNo(businessNo);
  if (biz.length === 10) {
    const hit = index.byBiz.get(biz);
    if (hit) return hit;
  }
  const nameKey = normalizeCompanyName(companyName);
  if (nameKey) {
    const hit = index.byName.get(nameKey);
    if (hit) return hit;
  }
  return null;
}

export interface ListArrearsFilters {
  manager?: string;
  category?: string;
  q?: string;
  /** true면 잔액 ≠ 0 */
  nonzero?: boolean;
  minBalance?: number;
  /** 담당자 본인만 — 서버에서 이름 목록으로 제한 */
  managerNames?: string[];
}

export async function listArrearsEntries(filters: ListArrearsFilters = {}): Promise<{
  items: ArrearsEntryDto[];
  totalsByManager: ArrearsManagerTotal[];
  totalBalance: number;
  asOfDate: string;
}> {
  const db = getDb();
  const conditions: SQL[] = [];

  if (filters.manager) {
    conditions.push(eq(arrearsEntries.managerName, filters.manager.trim()));
  }
  if (filters.category !== undefined && filters.category !== 'all') {
    conditions.push(eq(arrearsEntries.mgmtCategory, filters.category));
  }
  if (filters.nonzero) {
    conditions.push(ne(arrearsEntries.balance, 0));
  } else if (filters.minBalance != null && Number.isFinite(filters.minBalance)) {
    conditions.push(gte(arrearsEntries.balance, Math.round(filters.minBalance)));
  }
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(arrearsEntries.companyName, q),
        ilike(arrearsEntries.externalCode, q),
        ilike(arrearsEntries.businessNo, q),
      )!,
    );
  }
  if (filters.managerNames?.length) {
    conditions.push(
      or(...filters.managerNames.map(n => eq(arrearsEntries.managerName, n)))!,
    );
  }

  const rows = await db
    .select()
    .from(arrearsEntries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(arrearsEntries.balance), asc(arrearsEntries.companyName));

  const items = await attachReasonSummaries(rows.map(toDto));
  const totalMap = new Map<string, ArrearsManagerTotal>();
  let totalBalance = 0;
  let asOfDate = '';

  for (const item of items) {
    totalBalance += item.balance;
    if (item.asOfDate && (!asOfDate || item.asOfDate > asOfDate)) {
      asOfDate = item.asOfDate;
    }
    const key = item.managerName.trim() || '(미지정)';
    const cur = totalMap.get(key) ?? { managerName: key, count: 0, balance: 0 };
    cur.count += 1;
    cur.balance += item.balance;
    totalMap.set(key, cur);
  }

  const totalsByManager = [...totalMap.values()].sort((a, b) => b.balance - a.balance);

  return { items, totalsByManager, totalBalance, asOfDate };
}

export async function getArrearsEntryById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.id, id)).limit(1);
  return row ? toDto(row) : null;
}

const VALID_CATEGORIES = new Set(['', 'recovery', 'bad', 'long', 'temp', 'cms']);

export async function patchArrearsEntry(
  id: string,
  actorName: string,
  patch: {
    managerName?: string;
    mgmtCategory?: string;
    memo?: string;
    cmsNote?: string;
    letterDate?: string;
    /** 잔액 절대값 설정 */
    balance?: number;
    /** pay=입금(잔액↓) / charge=미수추가(잔액↑) */
    balanceAction?: 'pay' | 'charge';
    amount?: number;
  },
): Promise<ArrearsEntryDto> {
  const db = getDb();
  const [existing] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');

  const updates: Partial<typeof arrearsEntries.$inferInsert> = {
    updatedBy: actorName.trim() || '',
    updatedAt: new Date(),
  };

  if (patch.managerName !== undefined) {
    updates.managerName = patch.managerName.trim();
  }
  if (patch.mgmtCategory !== undefined) {
    const cat = patch.mgmtCategory.trim();
    if (!VALID_CATEGORIES.has(cat)) throw new Error('관리분류가 올바르지 않습니다.');
    updates.mgmtCategory = cat;
  }
  if (patch.memo !== undefined) {
    updates.memo = patch.memo;
  }
  if (patch.cmsNote !== undefined) {
    updates.cmsNote = patch.cmsNote;
  }
  if (patch.letterDate !== undefined) {
    updates.letterDate = patch.letterDate.trim();
  }

  if (patch.balanceAction === 'pay' || patch.balanceAction === 'charge') {
    const amt = Math.round(Number(patch.amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error('금액은 0보다 커야 합니다.');
    }
    if (patch.balanceAction === 'pay') {
      updates.credit = existing.credit + amt;
      updates.balance = existing.balance - amt;
    } else {
      updates.debit = existing.debit + amt;
      updates.balance = existing.balance + amt;
    }
    updates.source = 'manual';
  } else if (patch.balance !== undefined) {
    if (!Number.isFinite(patch.balance)) throw new Error('잔액이 올바르지 않습니다.');
    updates.balance = Math.round(patch.balance);
    updates.source = 'manual';
  }

  const [row] = await db
    .update(arrearsEntries)
    .set(updates)
    .where(eq(arrearsEntries.id, id))
    .returning();

  return toDto(row);
}

export type LedgerImportPreviewRow = LedgerArrearsRow & {
  clientId: string | null;
  matchedCompanyName: string | null;
  managerName: string;
  isNew: boolean;
};

/**
 * 원장 가져오기 — 원장에 있는 코드만 upsert.
 * DB에만 있는 행(현황/공문 시드 등)은 삭제·영점화하지 않고 그대로 유지한다.
 */
export async function previewLedgerImport(
  ledgerRows: LedgerArrearsRow[],
): Promise<{
  rows: LedgerImportPreviewRow[];
  matched: number;
  unmatched: number;
  newCount: number;
  /** 원장에 없어 이번 가져오기에서 건드리지 않을 기존 DB 행 수 */
  preserved: number;
}> {
  const db = getDb();
  const index = await buildClientMatchIndex();
  const existing = await db
    .select({
      externalCode: arrearsEntries.externalCode,
      managerName: arrearsEntries.managerName,
    })
    .from(arrearsEntries);
  const existingByCode = new Map(existing.map(e => [e.externalCode, e]));
  const ledgerCodes = new Set(ledgerRows.map(r => r.externalCode));

  let matched = 0;
  let unmatched = 0;
  let newCount = 0;
  const rows: LedgerImportPreviewRow[] = [];

  for (const r of ledgerRows) {
    const client = matchClientForArrears(index, r.businessNo, r.companyName);
    const prev = existingByCode.get(r.externalCode);
    const isNew = !prev;
    if (isNew) newCount += 1;
    if (client) matched += 1;
    else unmatched += 1;

    rows.push({
      ...r,
      clientId: client?.id ?? null,
      matchedCompanyName: client?.companyName ?? null,
      managerName: prev?.managerName?.trim()
        ? prev.managerName
        : client?.manager || '',
      isNew,
    });
  }

  let preserved = 0;
  for (const code of existingByCode.keys()) {
    if (!ledgerCodes.has(code)) preserved += 1;
  }

  return { rows, matched, unmatched, newCount, preserved };
}

/**
 * 원장에 있는 external_code만 잔액·상호 등을 갱신/추가한다.
 * 원장에 없는 기존 행(현황·공문 등)은 삭제하지 않으며 담당·분류·메모·잔액도 유지한다.
 */
export async function upsertLedgerImport(
  ledgerRows: LedgerArrearsRow[],
  asOfDate: string,
  actorName: string,
): Promise<{
  inserted: number;
  updated: number;
  matched: number;
  unmatched: number;
  preserved: number;
}> {
  const db = getDb();
  const index = await buildClientMatchIndex();
  const existing = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      clientId: arrearsEntries.clientId,
      companyName: arrearsEntries.companyName,
      businessNo: arrearsEntries.businessNo,
      representative: arrearsEntries.representative,
    })
    .from(arrearsEntries);
  const existingByCode = new Map(existing.map(e => [e.externalCode, e]));
  const ledgerCodes = new Set(ledgerRows.map(r => r.externalCode));
  let preserved = 0;
  for (const code of existingByCode.keys()) {
    if (!ledgerCodes.has(code)) preserved += 1;
  }

  let inserted = 0;
  let updated = 0;
  let matched = 0;
  let unmatched = 0;
  const now = new Date();
  const actor = actorName.trim() || '';

  for (const r of ledgerRows) {
    const client = matchClientForArrears(index, r.businessNo, r.companyName);
    if (client) matched += 1;
    else unmatched += 1;

    const prev = existingByCode.get(r.externalCode);
    if (prev) {
      await db
        .update(arrearsEntries)
        .set({
          clientId: client?.id ?? prev.clientId,
          companyName: r.companyName || prev.companyName,
          businessNo: r.businessNo || prev.businessNo,
          representative: r.representative || prev.representative,
          balance: r.balance,
          carryIn: r.carryIn,
          debit: r.debit,
          credit: r.credit,
          asOfDate,
          source: 'ledger',
          updatedBy: actor,
          updatedAt: now,
          // managerName / mgmtCategory / cmsNote / memo — 원장에 없으므로 유지
        })
        .where(eq(arrearsEntries.id, prev.id));
      updated += 1;
    } else {
      await db.insert(arrearsEntries).values({
        clientId: client?.id ?? null,
        externalCode: r.externalCode,
        companyName: r.companyName,
        businessNo: r.businessNo,
        representative: r.representative,
        balance: r.balance,
        carryIn: r.carryIn,
        debit: r.debit,
        credit: r.credit,
        managerName: client?.manager || '',
        mgmtCategory: '',
        cmsNote: '',
        memo: '',
        asOfDate,
        source: 'ledger',
        updatedBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
      existingByCode.set(r.externalCode, {
        id: '',
        externalCode: r.externalCode,
        clientId: client?.id ?? null,
        companyName: r.companyName,
        businessNo: r.businessNo,
        representative: r.representative,
      });
    }
  }

  return { inserted, updated, matched, unmatched, preserved };
}

/** 현황표 메타(담당·분류·메모)만 보강 — 잔액은 건드리지 않음 */
export async function upsertStatusMeta(row: {
  externalCode: string;
  companyName: string;
  managerName: string;
  mgmtCategory: string;
  cmsNote: string;
  memo: string;
  asOfDate: string;
  actorName: string;
}): Promise<'inserted' | 'updated' | 'skipped'> {
  const db = getDb();
  const code = row.externalCode.trim();
  if (!code) return 'skipped';

  const [prev] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, code))
    .limit(1);

  const now = new Date();
  const actor = row.actorName.trim() || 'status_seed';

  if (prev) {
    await db
      .update(arrearsEntries)
      .set({
        managerName: row.managerName || prev.managerName,
        mgmtCategory: row.mgmtCategory || prev.mgmtCategory,
        cmsNote: row.cmsNote || prev.cmsNote,
        memo: row.memo || prev.memo,
        companyName: prev.companyName || row.companyName,
        updatedBy: actor,
        updatedAt: now,
      })
      .where(eq(arrearsEntries.id, prev.id));
    return 'updated';
  }

  // 원장 미반영 건 — 메타만으로 행 생성 (잔액 0, 이후 원장 가져오기로 채움)
  const index = await buildClientMatchIndex();
  const client = matchClientForArrears(index, '', row.companyName);
  await db.insert(arrearsEntries).values({
    clientId: client?.id ?? null,
    externalCode: code,
    companyName: row.companyName,
    businessNo: '',
    representative: '',
    balance: 0,
    carryIn: 0,
    debit: 0,
    credit: 0,
    managerName: row.managerName || client?.manager || '',
    mgmtCategory: row.mgmtCategory || '',
    cmsNote: row.cmsNote || '',
    memo: row.memo || '',
    asOfDate: row.asOfDate,
    source: 'status_seed',
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
  });
  return 'inserted';
}
