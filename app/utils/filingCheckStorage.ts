import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';

export type CheckRecord = FilingCheckSessionData;

export const EMPTY_CHECK_RECORD: CheckRecord = {
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

/** 제외·특이사항·직접추가 업체 등 승계 대상 필드 */
export function hasCarryFieldsData(rec: Partial<CheckRecord> | null | undefined): boolean {
  if (!rec) return false;
  if (Object.keys(rec.excluded ?? {}).length > 0) return true;
  if (Object.keys(rec.forceIncluded ?? {}).length > 0) return true;
  if (Object.keys(rec.rowNotes ?? {}).length > 0) return true;
  if ((rec.extraClients?.length ?? 0) > 0) return true;
  if (rec.diffReason?.trim()) return true;
  if (Object.keys(rec.specialReasons ?? {}).length > 0) return true;
  return false;
}

/** 접수목록(엑셀·체크)만 초기화 — 제외사유·특이사항·추가 업체는 유지 */
export function resetReceiptOnly(rec: CheckRecord): CheckRecord {
  return {
    ...rec,
    overrides: {},
    excelBizNos: [],
    excelNamesByBiz: {},
    fileName: '',
    specialFilings: [],
    done: false,
  };
}

export function mergeCarryFieldLayers(
  previous: CheckRecord | null | undefined,
  current: CheckRecord | null | undefined,
): Pick<
  CheckRecord,
  'diffReason' | 'specialReasons' | 'excluded' | 'forceIncluded' | 'rowNotes' | 'extraClients'
> {
  const prev = carryFieldsFromRecord(previous ? { ...EMPTY_CHECK_RECORD, ...previous } : EMPTY_CHECK_RECORD);
  const cur = carryFieldsFromRecord(current ? { ...EMPTY_CHECK_RECORD, ...current } : EMPTY_CHECK_RECORD);
  return {
    excluded: { ...prev.excluded, ...cur.excluded },
    forceIncluded: { ...prev.forceIncluded, ...cur.forceIncluded },
    rowNotes: { ...prev.rowNotes, ...cur.rowNotes },
    specialReasons: { ...prev.specialReasons, ...cur.specialReasons },
    extraClients: cur.extraClients.length > 0 ? cur.extraClients : prev.extraClients,
    diffReason: cur.diffReason.trim() ? cur.diffReason : prev.diffReason,
  };
}

/** 제외사유·특이사항·접수 등 실질 데이터가 있는지 */
export function hasFilingCarryData(rec: Partial<CheckRecord> | null | undefined): boolean {
  if (!rec) return false;
  if (hasCarryFieldsData(rec)) return true;
  if (rec.done) return true;
  if (rec.fileName?.trim()) return true;
  if ((rec.excelBizNos?.length ?? 0) > 0) return true;
  if ((rec.specialFilings?.length ?? 0) > 0) return true;
  return false;
}

/** localStorage·서버 기록 병합 — 제외사유·특이사항 우선 보존 */
export function mergeFilingRecords(
  local: CheckRecord | null,
  server: CheckRecord | null,
): CheckRecord | null {
  if (!local && !server) return null;
  if (!local) return server;
  if (!server || !hasFilingCarryData(server)) return local;
  if (!hasFilingCarryData(local)) return server;

  return {
    ...server,
    diffReason: server.diffReason?.trim() ? server.diffReason : local.diffReason,
    excluded: { ...local.excluded, ...server.excluded },
    forceIncluded: { ...local.forceIncluded, ...server.forceIncluded },
    rowNotes: { ...local.rowNotes, ...server.rowNotes },
    specialReasons: { ...local.specialReasons, ...server.specialReasons },
    extraClients: server.extraClients?.length ? server.extraClients : local.extraClients,
    excelBizNos: server.excelBizNos?.length ? server.excelBizNos : local.excelBizNos,
    excelNamesByBiz:
      Object.keys(server.excelNamesByBiz ?? {}).length > 0
        ? server.excelNamesByBiz
        : local.excelNamesByBiz,
    fileName: server.fileName?.trim() ? server.fileName : local.fileName,
    overrides: { ...local.overrides, ...server.overrides },
    specialFilings: server.specialFilings?.length ? server.specialFilings : local.specialFilings,
    done: server.done || local.done,
  };
}

export function carryFieldsFromRecord(
  rec: CheckRecord,
): Pick<
  CheckRecord,
  'diffReason' | 'specialReasons' | 'excluded' | 'forceIncluded' | 'rowNotes' | 'extraClients'
> {
  return {
    diffReason: rec.diffReason ?? '',
    specialReasons: { ...(rec.specialReasons ?? {}) },
    excluded: { ...(rec.excluded ?? {}) },
    forceIncluded: { ...(rec.forceIncluded ?? {}) },
    rowNotes: { ...(rec.rowNotes ?? {}) },
    extraClients: [...(rec.extraClients ?? [])],
  };
}

export function filingCheckSessionStorageKey(
  storagePrefix: string,
  manager: string,
  taxType: string,
  currentPeriodKey: string,
): string {
  return `${storagePrefix}${manager}:${taxType}:${currentPeriodKey}`;
}

export function readLocalFilingCheckSession(
  storagePrefix: string,
  manager: string,
  taxType: string,
  currentPeriodKey: string,
): CheckRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(
      filingCheckSessionStorageKey(storagePrefix, manager, taxType, currentPeriodKey),
    );
    if (!raw) return null;
    return { ...EMPTY_CHECK_RECORD, ...(JSON.parse(raw) as Partial<CheckRecord>) };
  } catch {
    return null;
  }
}

export function writeLocalFilingCheckSession(
  storagePrefix: string,
  manager: string,
  taxType: string,
  currentPeriodKey: string,
  rec: CheckRecord,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      filingCheckSessionStorageKey(storagePrefix, manager, taxType, currentPeriodKey),
      JSON.stringify(rec),
    );
  } catch {
    /* ignore */
  }
}

/** 직전 완료(done) 신고분 — localStorage 스캔 (readRecord/writeRecord와 동일 키 규칙) */
export function findPreviousCompletedLocal(
  storagePrefix: string,
  manager: string,
  taxType: string,
  currentPeriodKey: string,
): { record: CheckRecord; key: string } | null {
  if (typeof window === 'undefined') return null;
  const keyIdPrefix = `${storagePrefix}${manager}:${taxType}:`;
  const fullPrefix = `${storagePrefix}${keyIdPrefix}`;
  let bestKey = '';
  let bestRec: CheckRecord | null = null;
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(fullPrefix)) continue;
    const pk = k.slice(fullPrefix.length);
    if (pk >= currentPeriodKey) continue;
    try {
      const rec = { ...EMPTY_CHECK_RECORD, ...(JSON.parse(localStorage.getItem(k) || 'null') as Partial<CheckRecord>) };
      if (!rec.done) continue;
      if (pk > bestKey) {
        bestKey = pk;
        bestRec = rec;
      }
    } catch {
      /* skip */
    }
  }
  return bestRec ? { record: bestRec, key: bestKey } : null;
}

/** 같은 담당자·세목의 localStorage 키에서 제외·특이사항 회수 */
export function restoreCarryFromLocalStorage(
  storagePrefix: string,
  manager: string,
  taxType: string,
  currentPeriodKey: string,
): Pick<CheckRecord, 'excluded' | 'forceIncluded' | 'rowNotes' | 'diffReason' | 'specialReasons'> {
  if (typeof window === 'undefined') {
    return { excluded: {}, forceIncluded: {}, rowNotes: {}, diffReason: '', specialReasons: {} };
  }

  const prefix = `${storagePrefix}${manager}:${taxType}:`;
  const excluded: Record<string, string> = {};
  const forceIncluded: Record<string, boolean> = {};
  const rowNotes: Record<string, string> = {};
  const specialReasons: Record<string, string> = {};
  let diffReason = '';

  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const rec = { ...EMPTY_CHECK_RECORD, ...(JSON.parse(raw) as Partial<CheckRecord>) };
      if (rec.diffReason?.trim() && !diffReason) diffReason = rec.diffReason;
      Object.assign(excluded, rec.excluded);
      Object.assign(forceIncluded, rec.forceIncluded);
      Object.assign(rowNotes, rec.rowNotes);
      Object.assign(specialReasons, rec.specialReasons);
    } catch {
      /* skip */
    }
  }

  // 현재 기간 키 데이터가 있으면 최우선
  try {
    const cur = localStorage.getItem(`${prefix}${currentPeriodKey}`);
    if (cur) {
      const rec = { ...EMPTY_CHECK_RECORD, ...(JSON.parse(cur) as Partial<CheckRecord>) };
      if (rec.diffReason?.trim()) diffReason = rec.diffReason;
      Object.assign(excluded, rec.excluded);
      Object.assign(forceIncluded, rec.forceIncluded);
      Object.assign(rowNotes, rec.rowNotes);
      Object.assign(specialReasons, rec.specialReasons);
    }
  } catch {
    /* skip */
  }

  return { excluded, forceIncluded, rowNotes, diffReason, specialReasons };
}
