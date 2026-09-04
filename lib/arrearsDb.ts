import { and, asc, desc, eq, exists, gte, ilike, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines, clients } from '@/db/schema';
import type { ArrearsEntryDto, ArrearsManagerTotal, ArrearsMgmtCategory } from '@/app/types/arrears';
import { normalizeBizNo } from '@/app/utils/filingCheck';
import type { LedgerArrearsRow } from '@/lib/arrearsLedgerParse';
import { normalizeLedgerBalanceSign } from '@/lib/arrearsLedgerParse';
import { classifyBalanceDiff } from '@/lib/arrearsBalanceDiff';
import {
  isArrearsExcelBalanceAligned,
  readArrearsDetailEndings,
} from '@/lib/arrearsDetailEndings';
import { monthlyBookkeepingFeeFromIntake } from '@/lib/arrearsMonthlyBookkeeping';
import { formatArrearsChargeLabel } from '@/lib/arrearsLineLabel';
import {
  applyArrearsManualBalance,
  ARREARS_ALWAYS_LISTED_CODES,
  isArrearsBalanceLocked,
} from '@/lib/arrearsBalanceLock';
import { ensureInactiveArrearsEntries } from '@/lib/arrearsInactiveSeed';
import { getArrearsGlobalAsOfDate } from '@/lib/arrearsAsOfDate';

/** 수동 지정 유지 — 자동 일시 분류로 덮지 않음 */
const ARREARS_CATEGORY_LOCK = new Set(['recovery', 'bad', 'long', 'cms']);

/** 미수 잔액 ≥ 월 기장료×2 이면 일시 후보 */
export function shouldAutoTempByMonthlyFee(balance: number, monthlyFee: number): boolean {
  if (!(monthlyFee > 0)) return false;
  return balance >= monthlyFee * 2;
}

function toDto(row: typeof arrearsEntries.$inferSelect): ArrearsEntryDto {
  return applyArrearsManualBalance({
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
  });
}

async function attachLineOpenBalances(items: ArrearsEntryDto[]): Promise<ArrearsEntryDto[]> {
  if (!items.length) return items;
  const db = getDb();
  const ids = items.map(i => i.id);
  const sums = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      total: sql<number>`coalesce(sum(${arrearsLetterLines.amount} - ${arrearsLetterLines.paidAmount}), 0)`,
      hasLetter: sql<boolean>`bool_or(${arrearsLetterLines.source} = 'letter')`,
    })
    .from(arrearsLetterLines)
    .where(inArray(arrearsLetterLines.arrearsEntryId, ids))
    .groupBy(arrearsLetterLines.arrearsEntryId);

  const openBy = new Map<string, number>();
  const letterBy = new Map<string, boolean>();
  for (const s of sums) {
    openBy.set(s.arrearsEntryId, Math.round(Number(s.total) || 0));
    letterBy.set(s.arrearsEntryId, Boolean(s.hasLetter));
  }

  const detailEndings = await readArrearsDetailEndings();

  return items.map(item => {
    const rawOpen = openBy.get(item.id) ?? 0;
    const excelAligned = isArrearsExcelBalanceAligned(
      item.externalCode,
      item.balance,
      detailEndings,
    );
    /**
     * 불일치 = 현황표 ≠ 거래처별 말잔(또는 공문 줄합).
     * 엑셀 두 파일 말잔이 같으면 OK.
     * 양수도(천돈가 등)는 공문과 현황이 다를 수 있음 → 불일치로 표시.
     */
    if (excelAligned) {
      return {
        ...item,
        linesOpen: Math.round(item.balance),
        balanceDiff: 0,
        balanceDiffKind: 'ok' as const,
      };
    }
    const linesOpen = rawOpen;
    const balanceDiff = Math.round(item.balance) - linesOpen;
    const balanceDiffKind = classifyBalanceDiff({
      ledgerBalance: item.balance,
      linesOpen,
      hasLetter: letterBy.get(item.id) === true,
    });
    return { ...item, linesOpen, balanceDiff, balanceDiffKind };
  });
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
      if (isArrearsBalanceLocked(item.externalCode)) {
        return { ...item, reasonSummary: charges.join(' · ') };
      }
      const asOf = item.asOfDate || item.letterDate;
      const formatted = charges.map((desc, i) =>
        formatArrearsChargeLabel(desc, {
          asOfDate: asOf,
          prevDescription: i > 0 ? charges[i - 1] : undefined,
        }),
      );
      return { ...item, reasonSummary: formatted.join(' · ') };
    }
    const memo = (item.memo || '').trim();
    return { ...item, reasonSummary: memo || '—' };
  });
}

/** 연결 수임처(또는 미연결 시 사업자번호·상호) 유출 여부 */
async function attachChurnFlags(items: ArrearsEntryDto[]): Promise<ArrearsEntryDto[]> {
  if (!items.length) return items;
  const db = getDb();
  const clientIds = [
    ...new Set(items.map(i => i.clientId).filter((id): id is string => Boolean(id))),
  ];
  const statusById = new Map<string, string>();
  if (clientIds.length > 0) {
    const byId = await db
      .select({ id: clients.id, status: clients.status })
      .from(clients)
      .where(inArray(clients.id, clientIds));
    for (const r of byId) statusById.set(r.id, r.status);
  }

  const unlinked = items.filter(i => !i.clientId);
  const churnedBiz = new Set<string>();
  const churnedName = new Set<string>();
  if (unlinked.length > 0) {
    const churnedRows = await db
      .select({
        businessNo: clients.businessNo,
        companyName: clients.companyName,
      })
      .from(clients)
      .where(eq(clients.status, 'churned'));
    for (const r of churnedRows) {
      const biz = normalizeBizNo(r.businessNo);
      if (biz.length === 10) churnedBiz.add(biz);
      const nameKey = normalizeCompanyName(r.companyName);
      if (nameKey) churnedName.add(nameKey);
    }
  }

  return items.map(item => {
    if (item.clientId) {
      return { ...item, isChurned: statusById.get(item.clientId) === 'churned' };
    }
    const biz = normalizeBizNo(item.businessNo);
    if (biz.length === 10 && churnedBiz.has(biz)) {
      return { ...item, isChurned: true };
    }
    const nameKey = normalizeCompanyName(item.companyName);
    if (nameKey && churnedName.has(nameKey)) {
      return { ...item, isChurned: true };
    }
    return { ...item, isChurned: false };
  });
}

/**
 * 수임처 월 기장료(공급가)의 2배 이상 미수이면 관리분류「일시」로 자동 지정.
 * 「일시」인데 잔액이 0원이면 미분류로 되돌림.
 * 채권회수·악성·장기·CMS는 수동 값 유지.
 */
async function syncTempCategoryByMonthlyFee(
  items: ArrearsEntryDto[],
): Promise<ArrearsEntryDto[]> {
  if (!items.length) return items;
  const clientIds = [
    ...new Set(items.map(i => i.clientId).filter((id): id is string => Boolean(id))),
  ];

  const db = getDb();

  // 목록 필터와 무관하게 일시+0원은 미분류로 정리
  await db
    .update(arrearsEntries)
    .set({ mgmtCategory: '', updatedAt: new Date() })
    .where(and(eq(arrearsEntries.mgmtCategory, 'temp'), eq(arrearsEntries.balance, 0)));

  const feeByClient = new Map<string, number>();
  if (clientIds.length) {
    const rows = await db
      .select({ id: clients.id, intakeData: clients.intakeData })
      .from(clients)
      .where(inArray(clients.id, clientIds));
    for (const r of rows) {
      feeByClient.set(r.id, monthlyBookkeepingFeeFromIntake(r.intakeData));
    }
  }

  const toTemp: string[] = [];
  const next = items.map(item => {
    // 일시 + 잔액 0 → 미분류 (위에서 DB 반영, 응답 DTO도 맞춤)
    if (item.mgmtCategory === 'temp' && Math.round(item.balance) === 0) {
      return { ...item, mgmtCategory: '' as ArrearsMgmtCategory };
    }

    if (!item.clientId) return item;
    const fee = feeByClient.get(item.clientId) ?? 0;
    if (!shouldAutoTempByMonthlyFee(item.balance, fee)) return item;
    if (ARREARS_CATEGORY_LOCK.has(item.mgmtCategory)) return item;
    if (item.mgmtCategory === 'temp') return item;
    toTemp.push(item.id);
    return { ...item, mgmtCategory: 'temp' as ArrearsMgmtCategory };
  });

  if (toTemp.length > 0) {
    await db
      .update(arrearsEntries)
      .set({ mgmtCategory: 'temp', updatedAt: new Date() })
      .where(inArray(arrearsEntries.id, toTemp));
  }
  return next;
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
  /** @deprecated managers 사용 */
  manager?: string;
  /** 담당자 다중 필터 (비어 있으면 전체) */
  managers?: string[];
  /** @deprecated categories 사용 */
  category?: string;
  /** 관리분류 다중 필터. '' = 미분류. 비어 있으면 전체 */
  categories?: string[];
  q?: string;
  /** true면 잔액 ≠ 0 */
  nonzero?: boolean;
  minBalance?: number;
  /** 담당자 본인만 — 서버에서 이름 목록으로 제한 */
  managerNames?: string[];
  /** true면 「원장반영」등 원장 맞춤 줄이 있는 행만 */
  ledgerRefOnly?: boolean;
  /** true면 진짜 잔액불일치(ledger_only 제외)만 */
  mismatchOnly?: boolean;
  /** true면 공문 없는 장기미수(원장만)만 */
  ledgerOnly?: boolean;
  /** true면 유출 수임처만 */
  churnedOnly?: boolean;
  /**
   * 목록/총미수 엑셀용 — 사유요약(+유출필터 시 churn)만.
   * 잔액불일치·일시동기 등 무거운 후처리를 생략한다.
   */
  light?: boolean;
}

export async function listArrearsEntries(filters: ListArrearsFilters = {}): Promise<{
  items: ArrearsEntryDto[];
  totalsByManager: ArrearsManagerTotal[];
  totalBalance: number;
  /** 목록 내역 미결합 합계 (원장잔액과 다를 수 있음) */
  totalLinesOpen: number;
  asOfDate: string;
}> {
  await ensureInactiveArrearsEntries();
  const db = getDb();
  const conditions: SQL[] = [];

  const managerFilter = [
    ...(filters.managers ?? []),
    ...(filters.manager?.trim() ? [filters.manager.trim()] : []),
  ].filter((n, i, arr) => arr.indexOf(n) === i);
  if (managerFilter.length === 1) {
    conditions.push(eq(arrearsEntries.managerName, managerFilter[0]));
  } else if (managerFilter.length > 1) {
    conditions.push(or(...managerFilter.map(n => eq(arrearsEntries.managerName, n)))!);
  }

  const categoryFilter = [
    ...(filters.categories ?? []),
    ...(filters.category !== undefined && filters.category !== 'all' ? [filters.category] : []),
  ].filter((n, i, arr) => arr.indexOf(n) === i);
  if (categoryFilter.length === 1) {
    conditions.push(eq(arrearsEntries.mgmtCategory, categoryFilter[0]));
  } else if (categoryFilter.length > 1) {
    conditions.push(or(...categoryFilter.map(c => eq(arrearsEntries.mgmtCategory, c)))!);
  }
  if (filters.nonzero) {
    // 「0원인것도 보기」 OFF → 잔액 ≠ 0만 (수동 0원 고정 행은 예외)
    const alwaysListed = [...ARREARS_ALWAYS_LISTED_CODES];
    conditions.push(
      alwaysListed.length
        ? or(
            ne(arrearsEntries.balance, 0),
            inArray(arrearsEntries.externalCode, alwaysListed),
          )!
        : ne(arrearsEntries.balance, 0),
    );
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
  if (filters.ledgerRefOnly) {
    conditions.push(
      exists(
        db
          .select({ id: arrearsLetterLines.id })
          .from(arrearsLetterLines)
          .where(
            and(
              eq(arrearsLetterLines.arrearsEntryId, arrearsEntries.id),
              or(
                eq(arrearsLetterLines.source, 'ledger'),
                like(arrearsLetterLines.description, '%원장반영%'),
                like(arrearsLetterLines.description, '%원장 추가미수%'),
                like(arrearsLetterLines.description, '%원장 잔액%'),
                like(arrearsLetterLines.description, '%전기이월%'),
                like(arrearsLetterLines.description, '%원장 입금%'),
              )!,
            )!,
          ),
      ),
    );
  }

  const rows = await db
    .select()
    .from(arrearsEntries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(arrearsEntries.balance), asc(arrearsEntries.companyName));

  const withReasons = await attachReasonSummaries(rows.map(toDto));

  let items: ArrearsEntryDto[];
  if (filters.light) {
    // 총미수 엑셀·가벼운 목록: 라인합계/일시동기 생략
    if (filters.churnedOnly) {
      items = (await attachChurnFlags(withReasons)).filter(i => i.isChurned);
    } else {
      items = withReasons;
    }
  } else {
    const withOpens = await attachLineOpenBalances(withReasons);
    const withChurn = await attachChurnFlags(withOpens);
    const withTemp = await syncTempCategoryByMonthlyFee(withChurn);
    items = filters.churnedOnly
      ? withTemp.filter(i => i.isChurned)
      : withTemp;
    if (filters.mismatchOnly) {
      items = items.filter(i => i.balanceDiffKind === 'mismatch');
    }
    if (filters.ledgerOnly) {
      items = items.filter(i => i.balanceDiffKind === 'ledger_only');
    }
  }
  const totalMap = new Map<string, ArrearsManagerTotal>();
  let totalBalance = 0;
  let totalLinesOpen = 0;
  let asOfDate = '';

  for (const item of items) {
    totalBalance += item.balance;
    totalLinesOpen += item.linesOpen ?? item.balance;
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

  const globalAsOf = await getArrearsGlobalAsOfDate();

  return { items, totalsByManager, totalBalance, totalLinesOpen, asOfDate: globalAsOf || asOfDate };
}

export { getArrearsGlobalAsOfDate } from '@/lib/arrearsAsOfDate';

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

  const balanceLocked = isArrearsBalanceLocked(existing.externalCode);
  if (
    balanceLocked &&
    (patch.balanceAction === 'pay' ||
      patch.balanceAction === 'charge' ||
      patch.balance !== undefined)
  ) {
    throw new Error('거래 중단 업체는 잔액을 변경할 수 없습니다.');
  }

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

  let dto = toDto(row);
  const balanceTouched =
    patch.balanceAction === 'pay' ||
    patch.balanceAction === 'charge' ||
    patch.balance !== undefined;
  // 잔액 변경 시·분류를 이번 요청에서 수동 지정하지 않은 경우 일시 자동분류
  if (balanceTouched && patch.mgmtCategory === undefined) {
    const synced = await syncTempCategoryByMonthlyFee([dto]);
    dto = synced[0] ?? dto;
  }
  return dto;
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

  for (const raw of ledgerRows) {
    const r: LedgerArrearsRow = {
      ...raw,
      balance: normalizeLedgerBalanceSign({
        carryIn: raw.carryIn,
        debit: raw.debit,
        credit: raw.credit,
        balance: raw.balance,
      }),
    };
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

  for (const raw of ledgerRows) {
    const r: LedgerArrearsRow = {
      ...raw,
      balance: normalizeLedgerBalanceSign({
        carryIn: raw.carryIn,
        debit: raw.debit,
        credit: raw.credit,
        balance: raw.balance,
      }),
    };
    const client = matchClientForArrears(index, r.businessNo, r.companyName);
    if (client) matched += 1;
    else unmatched += 1;

    const prev = existingByCode.get(r.externalCode);
    if (prev) {
      const balanceLocked = isArrearsBalanceLocked(r.externalCode);
      await db
        .update(arrearsEntries)
        .set({
          clientId: client?.id ?? prev.clientId,
          companyName: r.companyName || prev.companyName,
          businessNo: r.businessNo || prev.businessNo,
          representative: r.representative || prev.representative,
          ...(balanceLocked
            ? {}
            : {
                balance: r.balance,
                carryIn: r.carryIn,
                debit: r.debit,
                credit: r.credit,
                source: 'ledger' as const,
              }),
          asOfDate,
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
