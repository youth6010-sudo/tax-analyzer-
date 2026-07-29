import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { filingCheckSessions, taxFilingChecks } from '@/db/schema';
import type { FilingTaxId } from '@/app/utils/filingCheck';
import { specialFilingKey } from '@/app/utils/filingCheck';
import {
  carryFieldsFromRecord,
  hasCarryFieldsData,
  mergeCarryFieldLayers,
} from '@/app/utils/filingCheckStorage';
import { getManagerMatchNames } from '@/app/utils/managerMatch';

export type FilingCheckSessionData = {
  overrides: Record<string, boolean>;
  excelBizNos: string[];
  /** 홈택스 접수목록 사업자번호 → 상호 (안내 문구용) */
  excelNamesByBiz?: Record<string, string>;
  fileName: string;
  diffReason: string;
  done: boolean;
  specialFilings: { bizNo: string; name: string; type: string; count: number }[];
  specialReasons: Record<string, string>;
  excluded: Record<string, string>;
  /**
   * 반기 자동제외 등을 수기로 다시 살린 업체 (clientId → true).
   * excluded에 없어도 자동제외 사유가 있으면 이 목록으로 신고대상·접수체크에 포함.
   */
  forceIncluded?: Record<string, boolean>;
  rowNotes: Record<string, string>;
  extraClients: { id: string; companyName: string; businessNo: string; representative?: string; filingType?: '당월' | '전월' }[];
  /** 신고대상확인 화면 전용 업체 순서 */
  clientOrder?: string[];
  /** 종소세 — 사업장별 작업 완료(접수 엑셀 검증과 별도) */
  siteDone?: Record<string, boolean>;
};

export const EMPTY_SESSION_DATA: FilingCheckSessionData = {
  overrides: {},
  excelBizNos: [],
  excelNamesByBiz: {},
  fileName: '',
  diffReason: '',
  done: false,
  specialFilings: [],
  specialReasons: {},
  excluded: {},
  forceIncluded: {},
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

/** 직전 완료(done) 신고분 — 다음 리스트 제외·특이사항 승계 기준 */
export async function findPreviousCompletedFilingCheckSession(
  manager: string,
  taxType: FilingTaxId | string,
  currentPeriodKey: string,
): Promise<{ data: FilingCheckSessionData; periodKey: string } | null> {
  const db = getDb();
  const isAll = manager === '전체';
  const names = isAll
    ? null
    : [...new Set([manager, ...getManagerMatchNames(manager)].map(n => n.trim()).filter(Boolean))];

  const conditions = [
    eq(filingCheckSessions.taxType, taxType),
    lt(filingCheckSessions.periodKey, currentPeriodKey),
    sql`(${filingCheckSessions.data}->>'done') = 'true'`,
  ];
  if (names && names.length > 0) {
    conditions.push(inArray(filingCheckSessions.manager, names));
  } else if (isAll) {
    // 「전체」행은 저장하지 않음 — 담당자 세션만 탐색
    conditions.push(sql`${filingCheckSessions.manager} <> '전체'`);
  }

  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(and(...conditions))
    .orderBy(desc(filingCheckSessions.periodKey))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    data: { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) },
    periodKey: row.periodKey,
  };
}

export type FilingCheckLoadResult = {
  data: FilingCheckSessionData;
  carriedFromPeriodKey: string | null;
};

function receiptSlice(rec: Partial<FilingCheckSessionData> | null | undefined) {
  return {
    overrides: rec?.overrides ?? {},
    excelBizNos: rec?.excelBizNos ?? [],
    excelNamesByBiz: rec?.excelNamesByBiz ?? {},
    fileName: rec?.fileName ?? '',
    specialFilings: rec?.specialFilings ?? [],
    done: rec?.done ?? false,
    siteDone: rec?.siteDone,
  };
}

/** 담당자별 접수(엑셀·수동체크)를 합침 — 「전체」조회·닉네임/실명 세션 동기화용 */
function mergeReceiptSlices(
  parts: Array<Partial<FilingCheckSessionData> | null | undefined>,
): ReturnType<typeof receiptSlice> {
  const excelBizNos = new Set<string>();
  const excelNamesByBiz: Record<string, string> = {};
  const overrides: Record<string, boolean> = {};
  const specialFilings: FilingCheckSessionData['specialFilings'] = [];
  const specialKeys = new Set<string>();
  const fileNames: string[] = [];
  let siteDone: Record<string, boolean> = {};
  let anyDone = false;

  for (const rec of parts) {
    if (!rec) continue;
    for (const b of rec.excelBizNos ?? []) {
      const n = String(b).trim();
      if (n) excelBizNos.add(n);
    }
    for (const [biz, name] of Object.entries(rec.excelNamesByBiz ?? {})) {
      if (!excelNamesByBiz[biz] && name) excelNamesByBiz[biz] = name;
    }
    for (const [id, v] of Object.entries(rec.overrides ?? {})) {
      if (v) overrides[id] = true;
      else if (!Object.prototype.hasOwnProperty.call(overrides, id)) overrides[id] = false;
    }
    for (const s of rec.specialFilings ?? []) {
      const k = `${s.bizNo}|${s.type}`;
      if (specialKeys.has(k)) continue;
      specialKeys.add(k);
      specialFilings.push(s);
    }
    const fn = rec.fileName?.trim();
    if (fn && !fileNames.includes(fn)) fileNames.push(fn);
    if (rec.siteDone) siteDone = { ...siteDone, ...rec.siteDone };
    if (rec.done) anyDone = true;
  }

  return {
    overrides,
    excelBizNos: [...excelBizNos],
    excelNamesByBiz,
    fileName: fileNames.join(' · '),
    specialFilings,
    done: anyDone,
    siteDone,
  };
}

/** 해당 세목·기간의 모든 담당자 세션 */
async function listFilingCheckSessionsForPeriod(
  taxType: FilingTaxId | string,
  periodKey: string,
): Promise<Array<{ manager: string; data: FilingCheckSessionData }>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(
      and(eq(filingCheckSessions.taxType, taxType), eq(filingCheckSessions.periodKey, periodKey)),
    );
  return rows.map(row => ({
    manager: row.manager,
    data: {
      ...EMPTY_SESSION_DATA,
      ...(row.data as Partial<FilingCheckSessionData>),
    },
  }));
}

/** 「전체」·별칭 세션 — 제외·강제포함·메모·추가업체를 합침 (관리자 화면과 담당자 제외 일치) */
function mergeCarrySlicesFromParts(
  parts: Array<Partial<FilingCheckSessionData> | null | undefined>,
): Pick<FilingCheckSessionData, 'excluded' | 'forceIncluded' | 'rowNotes' | 'extraClients'> {
  const excluded: Record<string, string> = {};
  const forceIncluded: Record<string, boolean> = {};
  const rowNotes: Record<string, string> = {};
  const extraById = new Map<string, FilingCheckSessionData['extraClients'][number]>();

  for (const rec of parts) {
    if (!rec) continue;
    for (const [id, reason] of Object.entries(rec.excluded ?? {})) {
      const next = reason ?? '';
      if (!Object.prototype.hasOwnProperty.call(excluded, id)) {
        excluded[id] = next;
        continue;
      }
      const cur = excluded[id] ?? '';
      const curWeak = !cur.trim() || cur === '미접수 자동제외';
      const nextStrong = Boolean(next.trim()) && next !== '미접수 자동제외';
      if (curWeak && nextStrong) excluded[id] = next;
    }
    for (const [id, v] of Object.entries(rec.forceIncluded ?? {})) {
      if (v) forceIncluded[id] = true;
    }
    for (const [id, note] of Object.entries(rec.rowNotes ?? {})) {
      if ((note ?? '').trim() && !(rowNotes[id] ?? '').trim()) rowNotes[id] = note;
    }
    for (const e of rec.extraClients ?? []) {
      if (e?.id && !extraById.has(e.id)) extraById.set(e.id, e);
    }
  }

  return {
    excluded,
    forceIncluded,
    rowNotes,
    extraClients: [...extraById.values()],
  };
}

function overlayMergedCarry(
  base: Pick<FilingCheckSessionData, 'excluded' | 'forceIncluded' | 'rowNotes' | 'extraClients'>,
  overlay: ReturnType<typeof mergeCarrySlicesFromParts> | null,
): Pick<FilingCheckSessionData, 'excluded' | 'forceIncluded' | 'rowNotes' | 'extraClients'> {
  if (!overlay) {
    return {
      excluded: base.excluded ?? {},
      forceIncluded: base.forceIncluded ?? {},
      rowNotes: base.rowNotes ?? {},
      extraClients: base.extraClients ?? [],
    };
  }
  const extras = mergeCarrySlicesFromParts([
    { extraClients: overlay.extraClients },
    { extraClients: base.extraClients ?? [] },
  ]).extraClients;
  return {
    excluded: mergeCarrySlicesFromParts([
      { excluded: overlay.excluded },
      { excluded: base.excluded ?? {} },
    ]).excluded,
    forceIncluded: {
      ...(overlay.forceIncluded ?? {}),
      ...(base.forceIncluded ?? {}),
    },
    rowNotes: {
      ...overlay.rowNotes,
      ...Object.fromEntries(
        Object.entries(base.rowNotes ?? {}).filter(([, v]) => (v ?? '').trim()),
      ),
    },
    extraClients: extras,
  };
}

/** 「전체」조회 — 담당자별 기한후·수정신고 사유를 결재자가 모두 볼 수 있게 합침 */
function mergeSpecialsFromManagerSessions(
  sessions: Array<{ manager: string; data: FilingCheckSessionData }>,
): Pick<FilingCheckSessionData, 'specialFilings' | 'specialReasons'> {
  const filingsMap = new Map<string, FilingCheckSessionData['specialFilings'][number]>();
  const reasonParts: Record<string, string[]> = {};

  for (const { manager, data } of sessions) {
    const mgr = manager.trim();
    if (!mgr || mgr === '전체') continue;

    for (const s of data.specialFilings ?? []) {
      const k = specialFilingKey(s.bizNo, s.type);
      if (!filingsMap.has(k)) filingsMap.set(k, s);
      const r = (data.specialReasons?.[k] ?? '').trim();
      if (r) {
        const label = `${mgr}: ${r}`;
        if (!reasonParts[k]) reasonParts[k] = [];
        if (!reasonParts[k].includes(label)) reasonParts[k].push(label);
      }
    }

    for (const [k, raw] of Object.entries(data.specialReasons ?? {})) {
      const r = raw?.trim();
      if (!r) continue;
      const label = `${mgr}: ${r}`;
      if (!reasonParts[k]) reasonParts[k] = [];
      if (!reasonParts[k].includes(label)) reasonParts[k].push(label);
    }
  }

  return {
    specialFilings: [...filingsMap.values()],
    specialReasons: Object.fromEntries(
      Object.entries(reasonParts).map(([k, parts]) => [k, parts.join(' · ')]),
    ),
  };
}

/** 전월 제외 키가 당월에 빠져 있으면 승계가 더 필요 */
function carryNeedsPreviousMerge(
  previous: FilingCheckSessionData | null | undefined,
  current: FilingCheckSessionData | null | undefined,
): boolean {
  if (!previous) return false;
  const prevEx = previous.excluded ?? {};
  const curEx = current?.excluded ?? {};
  for (const id of Object.keys(prevEx)) {
    if (!Object.prototype.hasOwnProperty.call(curEx, id)) return true;
  }
  const prevNotes = previous.rowNotes ?? {};
  const curNotes = current?.rowNotes ?? {};
  for (const id of Object.keys(prevNotes)) {
    if (!(curNotes[id] ?? '').trim() && (prevNotes[id] ?? '').trim()) return true;
  }
  const prevForce = previous.forceIncluded ?? {};
  const curForce = current?.forceIncluded ?? {};
  for (const id of Object.keys(prevForce)) {
    if (prevForce[id] && !curForce[id]) return true;
  }
  if ((previous.extraClients?.length ?? 0) > 0 && (current?.extraClients?.length ?? 0) === 0) {
    return true;
  }
  if ((previous.diffReason ?? '').trim() && !(current?.diffReason ?? '').trim()) return true;
  return false;
}

/** 현재 기간 세션 + 직전 완료 신고분 제외·특이사항 병합 (접수는 매월 새로). 당월에 일부 제외가 있어도 완료분 누락분은 채움. */
export async function loadFilingCheckSessionWithCarry(
  manager: string,
  taxType: FilingTaxId | string,
  periodKey: string,
): Promise<FilingCheckLoadResult> {
  const current = await getFilingCheckSession(manager, taxType, periodKey);
  const previous = await findPreviousCompletedFilingCheckSession(manager, taxType, periodKey);

  // 「전체」·닉네임/실명 별칭 세션의 접수를 합쳐 관리자 화면과 담당자 화면이 어긋나지 않게 함
  const receiptParts: Array<Partial<FilingCheckSessionData> | null> = [current];
  let periodSessions: Array<{ manager: string; data: FilingCheckSessionData }> = [];
  if (manager === '전체') {
    periodSessions = await listFilingCheckSessionsForPeriod(taxType, periodKey);
    receiptParts.push(...periodSessions.map(s => s.data));
  } else {
    const aliases = getManagerMatchNames(manager).filter(n => n !== manager);
    if (aliases.length > 0) {
      const aliasSessions = await Promise.all(
        aliases.map(n => getFilingCheckSession(n, taxType, periodKey)),
      );
      receiptParts.push(...aliasSessions);
    }
  }
  const mergedReceipt = mergeReceiptSlices(receiptParts);
  const mergedSpecials =
    manager === '전체' && periodSessions.length > 0
      ? mergeSpecialsFromManagerSessions(periodSessions)
      : null;
  // 「전체」= 담당자별 제외 합침 / 담당자 = 닉네임·실명 별칭 제외 합침
  const mergedManagerCarry =
    manager === '전체'
      ? mergeCarrySlicesFromParts(
          periodSessions
            .filter(s => s.manager.trim() && s.manager !== '전체')
            .map(s => s.data),
        )
      : receiptParts.length > 1
        ? mergeCarrySlicesFromParts(receiptParts)
        : null;

  if (current === null) {
    if (previous) {
      const carry = overlayMergedCarry(carryFieldsFromRecord(previous.data), mergedManagerCarry);
      return {
        data: {
          ...EMPTY_SESSION_DATA,
          ...carryFieldsFromRecord(previous.data),
          ...carry,
          ...mergedReceipt,
          ...(mergedSpecials ?? {}),
          done: false,
        },
        carriedFromPeriodKey: previous.periodKey,
      };
    }
    return {
      data: {
        ...EMPTY_SESSION_DATA,
        ...(mergedManagerCarry ?? {}),
        ...mergedReceipt,
        ...(mergedSpecials ?? {}),
        done: false,
      },
      carriedFromPeriodKey: null,
    };
  }

  // 직전 완료분이 있으면 7월 등 다음 리스트에 승계 출처를 항상 표시
  const carriedFromPeriodKey = previous?.periodKey ?? null;

  if (previous && carryNeedsPreviousMerge(previous.data, current)) {
    const carry = mergeCarryFieldLayers(previous.data, current);
    const carryOverlay = overlayMergedCarry(carry, mergedManagerCarry);
    const merged: FilingCheckSessionData = {
      ...EMPTY_SESSION_DATA,
      ...carry,
      ...carryOverlay,
      ...mergedReceipt,
      ...(mergedSpecials ?? {}),
      // 담당자 본인 세션의 완료 여부 유지 (전체 합산 done은 쓰지 않음)
      done: current.done,
      clientOrder: current.clientOrder,
      siteDone: mergedReceipt.siteDone ?? current.siteDone,
    };
    // 「전체」는 합산 접수를 저장하지 않음 — 담당자별 원본만 유지
    if (manager !== '전체') {
      await upsertFilingCheckSession(manager, taxType, periodKey, {
        ...merged,
        ...receiptSlice(current), // DB에는 본인 접수만 유지
        done: current.done,
      });
    }
    return { data: merged, carriedFromPeriodKey };
  }

  const currentCarry = overlayMergedCarry(carryFieldsFromRecord(current), mergedManagerCarry);
  return {
    data: {
      ...EMPTY_SESSION_DATA,
      ...carryFieldsFromRecord(current),
      ...currentCarry,
      ...mergedReceipt,
      ...(mergedSpecials ?? {}),
      done: current.done,
    },
    carriedFromPeriodKey,
  };
}

/** 목록 조회용 — 승계 병합만 하고 DB에 쓰지 않음 (담당자 N회 조회 최적화) */
function mergeSessionForTargetList(
  current: FilingCheckSessionData | null,
  previous: { data: FilingCheckSessionData; periodKey: string } | null,
): FilingCheckSessionData {
  if (current === null) {
    if (previous) {
      return {
        ...EMPTY_SESSION_DATA,
        ...carryFieldsFromRecord(previous.data),
        ...receiptSlice(null),
      };
    }
    return { ...EMPTY_SESSION_DATA };
  }

  const receipt = receiptSlice(current);
  if (previous && carryNeedsPreviousMerge(previous.data, current)) {
    const carry = mergeCarryFieldLayers(previous.data, current);
    return {
      ...EMPTY_SESSION_DATA,
      ...carry,
      ...receipt,
      forceIncluded: {
        ...(previous.data.forceIncluded ?? {}),
        ...(current.forceIncluded ?? {}),
      },
      clientOrder: current.clientOrder,
      siteDone: current.siteDone,
    };
  }

  return { ...EMPTY_SESSION_DATA, ...carryFieldsFromRecord(current), ...receipt };
}

/**
 * 담당자별 신고대상확인 세션 일괄 로드 (승계 병합 · DB 쓰기 없음)
 */
export async function loadFilingCheckSessionsForTargetList(
  managers: string[],
  taxType: FilingTaxId | string,
  periodKey: string,
): Promise<Map<string, FilingCheckSessionData>> {
  const unique = [...new Set(managers.map(m => m.trim()).filter(Boolean))];
  const map = new Map<string, FilingCheckSessionData>();
  if (unique.length === 0) return map;

  const db = getDb();
  const [currentRows, prevRows] = await Promise.all([
    db
      .select()
      .from(filingCheckSessions)
      .where(
        and(
          eq(filingCheckSessions.taxType, taxType),
          eq(filingCheckSessions.periodKey, periodKey),
          inArray(filingCheckSessions.manager, unique),
        ),
      ),
    db
      .select()
      .from(filingCheckSessions)
      .where(
        and(
          eq(filingCheckSessions.taxType, taxType),
          lt(filingCheckSessions.periodKey, periodKey),
          sql`(${filingCheckSessions.data}->>'done') = 'true'`,
          inArray(filingCheckSessions.manager, unique),
        ),
      ),
  ]);

  const currentByManager = new Map<string, FilingCheckSessionData>();
  for (const row of currentRows) {
    currentByManager.set(
      row.manager,
      { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) },
    );
  }

  const prevByManager = new Map<string, { data: FilingCheckSessionData; periodKey: string }>();
  for (const row of prevRows) {
    const existing = prevByManager.get(row.manager);
    if (!existing || row.periodKey > existing.periodKey) {
      prevByManager.set(row.manager, {
        data: { ...EMPTY_SESSION_DATA, ...(row.data as Partial<FilingCheckSessionData>) },
        periodKey: row.periodKey,
      });
    }
  }

  for (const manager of unique) {
    map.set(
      manager,
      mergeSessionForTargetList(currentByManager.get(manager) ?? null, prevByManager.get(manager) ?? null),
    );
  }
  return map;
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
  const incoming = { ...EMPTY_SESSION_DATA, ...data };

  // 빈 로컬(EMPTY)로 기존 제외·특이사항을 통째로 지우는 경우만 방어.
  const incomingWipesCarry =
    !hasCarryFieldsData(incoming) &&
    (incoming.excelBizNos?.length ?? 0) === 0 &&
    !incoming.fileName?.trim() &&
    Object.keys(incoming.overrides ?? {}).length === 0;

  let merged: FilingCheckSessionData;
  if (existing && incomingWipesCarry && hasCarryFieldsData(existing)) {
    merged = {
      ...incoming,
      ...carryFieldsFromRecord(existing),
      ...receiptSlice(incoming),
      forceIncluded: {
        ...(existing.forceIncluded ?? {}),
        ...(incoming.forceIncluded ?? {}),
      },
      clientOrder: incoming.clientOrder ?? existing.clientOrder,
      siteDone: incoming.siteDone ?? existing.siteDone,
    };
  } else if (existing) {
    // 기존 세션 위에 요청 필드 덮어쓰기 (클라이언트가 보낸 top-level 값 그대로 사용 → 삭제 반영)
    merged = { ...existing, ...incoming };
  } else {
    merged = incoming;
  }

  if (existing) {
    await db
      .update(filingCheckSessions)
      .set({
        data: merged,
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
    data: merged,
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

/** 신고대상확인 세션 — 수동 추가 업체 id */
export async function getExtraClientIds(
  manager: string,
  taxType: FilingTaxId | string,
  periodKey: string,
): Promise<string[]> {
  const session = await getFilingCheckSession(manager, taxType, periodKey);
  return (session?.extraClients ?? []).map(e => e.id).filter(Boolean);
}

/** 원천세 세션 — 반기 자동제외를 수기로 살린 업체 */
export async function getForceIncludedClientIds(
  manager: string,
  periodKey: string,
): Promise<Record<string, boolean>> {
  const session = await getFilingCheckSession(manager, 'withholding', periodKey);
  return session?.forceIncluded ?? {};
}

/** 원천세 세션 특이사항 — 간이지급·연말정산 표시용 */
export async function getWithholdingRowNotesForPeriod(
  manager: string,
  periodKey: string,
): Promise<Record<string, string>> {
  const session = await getFilingCheckSession(manager, 'withholding', periodKey);
  return session?.rowNotes ?? {};
}

/** 해당 연도 원천세 세션 특이사항 합집합 (최근 월 우선) */
export async function getWithholdingRowNotesForYear(
  manager: string,
  year: number,
): Promise<Record<string, string>> {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const notesByMonth = await Promise.all(
    months.map(m => {
      const pk = `${year}-${String(m).padStart(2, '0')}`;
      return getWithholdingRowNotesForPeriod(manager, pk);
    }),
  );
  const merged: Record<string, string> = {};
  for (const notes of notesByMonth) {
    for (const [id, note] of Object.entries(notes)) {
      if (note.trim()) merged[id] = note;
    }
  }
  return merged;
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
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const exclusByMonth = await Promise.all(
    months.map(m => {
      const pk = `${year}-${String(m).padStart(2, '0')}`;
      return getExcludedClientIds(manager, 'withholding', pk);
    }),
  );
  const merged: Record<string, string> = {};
  for (const ex of exclusByMonth) {
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
  const forceIncluded = { ...(session.forceIncluded ?? {}) };
  const nowExcluded = !Object.prototype.hasOwnProperty.call(excluded, clientId);
  if (nowExcluded) {
    excluded[clientId] = excluded[clientId] ?? '';
    delete forceIncluded[clientId];
  } else {
    delete excluded[clientId];
    forceIncluded[clientId] = true;
  }
  await upsertFilingCheckSession(
    manager,
    'withholding',
    periodKey,
    { ...session, excluded, forceIncluded },
    userId,
  );
  return nowExcluded;
}

/** 제외만 해제 (이미 활성이면 그대로). forceIncluded는 건드리지 않음. */
export async function clearWithholdingClientExclusion(
  manager: string,
  periodKey: string,
  clientId: string,
  userId?: string,
): Promise<boolean> {
  const session = (await getFilingCheckSession(manager, 'withholding', periodKey)) ?? {
    ...EMPTY_SESSION_DATA,
  };
  if (!Object.prototype.hasOwnProperty.call(session.excluded, clientId)) return false;
  const excluded = { ...session.excluded };
  delete excluded[clientId];
  await upsertFilingCheckSession(
    manager,
    'withholding',
    periodKey,
    { ...session, excluded },
    userId,
  );
  return true;
}

/** 연도 전체(1~12월) 제외만 해제 */
export async function clearWithholdingClientExclusionForYear(
  manager: string,
  year: number,
  clientId: string,
  userId?: string,
): Promise<boolean> {
  const yearEx = await getWithholdingExclusionsForYear(manager, year);
  if (!Object.prototype.hasOwnProperty.call(yearEx, clientId)) return false;
  for (let m = 1; m <= 12; m += 1) {
    const pk = `${year}-${String(m).padStart(2, '0')}`;
    await clearWithholdingClientExclusion(manager, pk, clientId, userId);
  }
  return true;
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
    const forceIncluded = { ...(cur.forceIncluded ?? {}) };
    if (nowExcluded) {
      excluded[clientId] = excluded[clientId] ?? '';
      delete forceIncluded[clientId];
    } else {
      delete excluded[clientId];
      forceIncluded[clientId] = true;
    }
    await upsertFilingCheckSession(
      manager,
      'withholding',
      pk,
      { ...cur, excluded, forceIncluded },
      userId,
    );
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
