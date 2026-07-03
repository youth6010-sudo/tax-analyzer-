import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { filingCheckSessions, taxFilingChecks } from '@/db/schema';
import type { FilingTaxId } from '@/app/utils/filingCheck';
import {
  carryFieldsFromRecord,
  hasCarryFieldsData,
  mergeCarryFieldLayers,
} from '@/app/utils/filingCheckStorage';

export type FilingCheckSessionData = {
  overrides: Record<string, boolean>;
  excelBizNos: string[];
  fileName: string;
  diffReason: string;
  done: boolean;
  specialFilings: { bizNo: string; name: string; type: string; count: number }[];
  specialReasons: Record<string, string>;
  excluded: Record<string, string>;
  rowNotes: Record<string, string>;
  extraClients: { id: string; companyName: string; businessNo: string; representative?: string }[];
  /** 종소세 — 사업장별 작업 완료(접수 엑셀 검증과 별도) */
  siteDone?: Record<string, boolean>;
};

export const EMPTY_SESSION_DATA: FilingCheckSessionData = {
  overrides: {},
  excelBizNos: [],
  fileName: '',
  diffReason: '',
  done: false,
  specialFilings: [],
  specialReasons: {},
  excluded: {},
  rowNotes: {},
  extraClients: [],
};

export async function getFilingCheckSession(
  manager: string,
  taxType: FilingTaxId | string,
  periodKey: string,
): Promise<FilingCheckSessionData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, manager),
        eq(filingCheckSessions.taxType, taxType),
        eq(filingCheckSessions.periodKey, periodKey),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) };
}

/** 직전 신고분(완료 여부 무관) — DB 1회 조회 */
export async function findMostRecentPreviousFilingCheckSession(
  manager: string,
  taxType: FilingTaxId | string,
  currentPeriodKey: string,
): Promise<{ data: FilingCheckSessionData; periodKey: string } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, manager),
        eq(filingCheckSessions.taxType, taxType),
      ),
    );

  let bestKey = '';
  let bestData: FilingCheckSessionData | null = null;
  for (const row of rows) {
    if (row.periodKey >= currentPeriodKey) continue;
    const data = { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) };
    if (row.periodKey > bestKey) {
      bestKey = row.periodKey;
      bestData = data;
    }
  }
  return bestData ? { data: bestData, periodKey: bestKey } : null;
}

/** @deprecated 비교·레거시용 — 완료(done)분만 */
export async function findPreviousCompletedFilingCheckSession(
  manager: string,
  taxType: FilingTaxId | string,
  currentPeriodKey: string,
): Promise<{ data: FilingCheckSessionData; periodKey: string } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, manager),
        eq(filingCheckSessions.taxType, taxType),
      ),
    );

  let bestKey = '';
  let bestData: FilingCheckSessionData | null = null;
  for (const row of rows) {
    if (row.periodKey >= currentPeriodKey) continue;
    const data = { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) };
    if (!data.done) continue;
    if (row.periodKey > bestKey) {
      bestKey = row.periodKey;
      bestData = data;
    }
  }
  return bestData ? { data: bestData, periodKey: bestKey } : null;
}

export type FilingCheckLoadResult = {
  data: FilingCheckSessionData;
  carriedFromPeriodKey: string | null;
};

function receiptSlice(rec: Partial<FilingCheckSessionData> | null | undefined) {
  return {
    overrides: rec?.overrides ?? {},
    excelBizNos: rec?.excelBizNos ?? [],
    fileName: rec?.fileName ?? '',
    specialFilings: rec?.specialFilings ?? [],
    done: rec?.done ?? false,
    siteDone: rec?.siteDone,
  };
}

/** 현재 기간 세션 + 없으면 직전 신고분에서 제외·특이사항 승계 (접수는 매월 새로) */
export async function loadFilingCheckSessionWithCarry(
  manager: string,
  taxType: FilingTaxId | string,
  periodKey: string,
): Promise<FilingCheckLoadResult> {
  const current = await getFilingCheckSession(manager, taxType, periodKey);
  const previous = await findMostRecentPreviousFilingCheckSession(manager, taxType, periodKey);

  if (current === null) {
    if (previous) {
      return {
        data: {
          ...EMPTY_SESSION_DATA,
          ...carryFieldsFromRecord(previous.data),
          ...receiptSlice(null),
        },
        carriedFromPeriodKey: previous.periodKey,
      };
    }
    return { data: { ...EMPTY_SESSION_DATA }, carriedFromPeriodKey: null };
  }

  const receipt = receiptSlice(current);
  if (hasCarryFieldsData(current)) {
    return {
      data: { ...EMPTY_SESSION_DATA, ...carryFieldsFromRecord(current), ...receipt },
      carriedFromPeriodKey: null,
    };
  }

  if (previous) {
    const carry = mergeCarryFieldLayers(previous.data, current);
    return {
      data: { ...EMPTY_SESSION_DATA, ...carry, ...receipt },
      carriedFromPeriodKey: previous.periodKey,
    };
  }

  return {
    data: { ...EMPTY_SESSION_DATA, ...carryFieldsFromRecord(current), ...receipt },
    carriedFromPeriodKey: null,
  };
}

export async function upsertFilingCheckSession(
  manager: string,
  taxType: FilingTaxId | string,
  periodKey: string,
  data: FilingCheckSessionData,
  userId?: string,
): Promise<void> {
  const db = getDb();
  const existing = await getFilingCheckSession(manager, taxType, periodKey);
  if (existing) {
    await db
      .update(filingCheckSessions)
      .set({
        data,
        updatedByUserId: userId ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(filingCheckSessions.manager, manager),
          eq(filingCheckSessions.taxType, taxType),
          eq(filingCheckSessions.periodKey, periodKey),
        ),
      );
    return;
  }
  await db.insert(filingCheckSessions).values({
    manager,
    taxType,
    periodKey,
    data,
    updatedByUserId: userId ?? null,
  });
}

/** 신고대상확인 제외 목록 — 대시보드 실시간 반영용 */
export async function getExcludedClientIds(
  manager: string,
  taxType: string,
  periodKey: string,
): Promise<Record<string, string>> {
  const session = await getFilingCheckSession(manager, taxType, periodKey);
  return session?.excluded ?? {};
}

/** 간이지급 반기 — 해당 반기 원천세 세션의 제외 업체 합집합 */
export async function getWithholdingExclusionsForHalf(
  manager: string,
  year: number,
  half: 'H1' | 'H2',
): Promise<Record<string, string>> {
  const start = half === 'H1' ? 1 : 7;
  const end = half === 'H1' ? 6 : 12;
  const merged: Record<string, string> = {};
  for (let m = start; m <= end; m += 1) {
    const pk = `${year}-${String(m).padStart(2, '0')}`;
    const ex = await getExcludedClientIds(manager, 'withholding', pk);
    for (const [id, reason] of Object.entries(ex)) {
      if (!merged[id]) merged[id] = reason;
    }
  }
  return merged;
}

const AUTO_NO_WH = '원천세 신고내역 없음';

function mergeWithholdingReceiptHistory(
  session: FilingCheckSessionData | null | undefined,
  ids: Set<string>,
  bizNos: Set<string>,
  normalizeBizNo: (v: string | undefined | null) => string,
): void {
  if (!session) return;
  for (const b of session.excelBizNos ?? []) {
    const normalized = normalizeBizNo(b);
    if (normalized) bizNos.add(normalized);
  }
  for (const [id, v] of Object.entries(session.overrides ?? {})) {
    if (v) ids.add(id);
  }
}

/** 해당 연도 원천세 접수 이력(업체 id·사업자번호) — 연말정산 대상 판별용 */
export async function getWithholdingReceiptHistoryForYear(
  manager: string,
  year: number,
  normalizeBizNo: (v: string | undefined | null) => string,
): Promise<{ ids: Set<string>; bizNos: Set<string> }> {
  const ids = new Set<string>();
  const bizNos = new Set<string>();
  const db = getDb();
  const allManagers = !manager || manager === '전체';

  for (let m = 1; m <= 12; m += 1) {
    const pk = `${year}-${String(m).padStart(2, '0')}`;
    if (allManagers) {
      const rows = await db
        .select()
        .from(filingCheckSessions)
        .where(
          and(eq(filingCheckSessions.taxType, 'withholding'), eq(filingCheckSessions.periodKey, pk)),
        );
      for (const row of rows) {
        mergeWithholdingReceiptHistory(
          { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) },
          ids,
          bizNos,
          normalizeBizNo,
        );
      }
    } else {
      const session = await getFilingCheckSession(manager, 'withholding', pk);
      mergeWithholdingReceiptHistory(session, ids, bizNos, normalizeBizNo);
    }
  }

  return { ids, bizNos };
}

export { AUTO_NO_WH };

/** 해당 연도 원천세 세션 제외 업체 합집합 */
export async function getWithholdingExclusionsForYear(
  manager: string,
  year: number,
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (let m = 1; m <= 12; m += 1) {
    const pk = `${year}-${String(m).padStart(2, '0')}`;
    const ex = await getExcludedClientIds(manager, 'withholding', pk);
    for (const [id, reason] of Object.entries(ex)) {
      if (!merged[id]) merged[id] = reason;
    }
  }
  return merged;
}

/** 원천세 신고대상확인 세션 — 업체 제외 토글 */
export async function toggleWithholdingClientExclusion(
  manager: string,
  periodKey: string,
  clientId: string,
  userId?: string,
): Promise<boolean> {
  const session = (await getFilingCheckSession(manager, 'withholding', periodKey)) ?? {
    ...EMPTY_SESSION_DATA,
  };
  const excluded = { ...session.excluded };
  const nowExcluded = !Object.prototype.hasOwnProperty.call(excluded, clientId);
  if (nowExcluded) excluded[clientId] = excluded[clientId] ?? '';
  else delete excluded[clientId];
  await upsertFilingCheckSession(
    manager,
    'withholding',
    periodKey,
    { ...session, excluded },
    userId,
  );
  return nowExcluded;
}

/** 연말정산용 — 해당 연도 12개월 원천세 제외 동기 토글 */
export async function toggleWithholdingClientExclusionForYear(
  manager: string,
  year: number,
  clientId: string,
  userId?: string,
): Promise<boolean> {
  const yearEx = await getWithholdingExclusionsForYear(manager, year);
  const wasExcluded = Object.prototype.hasOwnProperty.call(yearEx, clientId);
  const nowExcluded = !wasExcluded;
  for (let m = 1; m <= 12; m += 1) {
    const pk = `${year}-${String(m).padStart(2, '0')}`;
    const cur = (await getFilingCheckSession(manager, 'withholding', pk)) ?? { ...EMPTY_SESSION_DATA };
    const excluded = { ...cur.excluded };
    if (nowExcluded) excluded[clientId] = excluded[clientId] ?? '';
    else delete excluded[clientId];
    await upsertFilingCheckSession(manager, 'withholding', pk, { ...cur, excluded }, userId);
  }
  return nowExcluded;
}

export async function upsertClientExclusion(
  clientId: string,
  taxType: string,
  periodKey: string,
  excludedReason: string,
  checkedBy: string,
): Promise<void> {
  const db = getDb();
  const status = excludedReason ? 'excluded' : 'pending';
  const rows = await db
    .select()
    .from(taxFilingChecks)
    .where(
      and(
        eq(taxFilingChecks.clientId, clientId),
        eq(taxFilingChecks.taxType, taxType),
        eq(taxFilingChecks.periodKey, periodKey),
        eq(taxFilingChecks.scope, 'branch'),
      ),
    )
    .limit(1);

  if (rows[0]) {
    await db
      .update(taxFilingChecks)
      .set({
        status,
        excludedReason,
        checkedBy,
        checkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taxFilingChecks.id, rows[0].id));
    return;
  }

  await db.insert(taxFilingChecks).values({
    clientId,
    taxType,
    periodKey,
    status,
    excludedReason,
    checkedBy,
    checkedAt: new Date(),
  });
}
