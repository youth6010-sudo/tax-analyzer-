import type { ClientRecord } from '@/app/types/client';
import { normalizeBizNo } from '@/app/utils/filingCheck';
import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';
import { shouldShowInWithholdingPeriod } from '@/lib/periodUtils';
import { getClientCategory, SINGO_DAERI } from '@/app/utils/clientsGrouping';
import { hasPlaceholderBizNo } from '@/app/utils/filingCheck';

function isActiveTarget(
  c: ClientRecord,
  session: FilingCheckSessionData | null,
  month: number,
): boolean {
  if (hasPlaceholderBizNo(c)) return false;
  if (getClientCategory(c) === SINGO_DAERI) return false;
  if (!shouldShowInWithholdingPeriod(c.intakeData ?? {}, month)) return false;
  if (session?.excluded && Object.prototype.hasOwnProperty.call(session.excluded, c.id)) {
    return false;
  }
  return true;
}

export type MonthlyCompareResult = {
  prevCount: number;
  currCount: number;
  diff: number;
  /** 이전 기간과 달라진 업체 (신규·제외·복귀) */
  changedClients: {
    id: string;
    companyName: string;
    businessNo: string;
    prevActive: boolean;
    currActive: boolean;
    change: 'added' | 'removed' | 'unchanged';
  }[];
};

export type PeriodCompareResult = MonthlyCompareResult;

function isExcludedInSession(session: FilingCheckSessionData | null, clientId: string): boolean {
  return Boolean(
    session?.excluded && Object.prototype.hasOwnProperty.call(session.excluded, clientId),
  );
}

/** 세션 제외 기준 — 신고대상 목록에서 활성 여부 */
export function isActiveFilingTarget(
  clientId: string,
  session: FilingCheckSessionData | null,
  autoExcluded?: boolean,
): boolean {
  if (autoExcluded) return false;
  return !isExcludedInSession(session, clientId);
}

/** 직전 신고분·전월 대비 — 신고대상 목록 + 제외 세션 기준 */
export function compareSessionTargets(
  prevTargets: ClientRecord[],
  currTargets: ClientRecord[],
  prevSession: FilingCheckSessionData | null,
  currSession: FilingCheckSessionData | null,
  opts?: {
    isAutoExcluded?: (c: ClientRecord, which: 'prev' | 'curr') => boolean;
  },
): PeriodCompareResult {
  const prevMap = new Map(prevTargets.map(c => [c.id, c]));
  const currMap = new Map(currTargets.map(c => [c.id, c]));
  const allIds = new Set([...prevMap.keys(), ...currMap.keys()]);
  const changedClients: PeriodCompareResult['changedClients'] = [];

  let prevCount = 0;
  let currCount = 0;

  for (const id of allIds) {
    const prevC = prevMap.get(id);
    const currC = currMap.get(id);
    const prevAuto = prevC ? opts?.isAutoExcluded?.(prevC, 'prev') ?? false : true;
    const currAuto = currC ? opts?.isAutoExcluded?.(currC, 'curr') ?? false : true;
    const prevActive = prevC
      ? isActiveFilingTarget(id, prevSession, prevAuto)
      : false;
    const currActive = currC
      ? isActiveFilingTarget(id, currSession, currAuto)
      : false;

    if (prevActive) prevCount += 1;
    if (currActive) currCount += 1;

    if (prevActive === currActive) continue;
    const c = currC ?? prevC!;
    changedClients.push({
      id,
      companyName: c.companyName,
      businessNo: normalizeBizNo(c.businessNo),
      prevActive,
      currActive,
      change: currActive ? 'added' : 'removed',
    });
  }

  changedClients.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  return { prevCount, currCount, diff: currCount - prevCount, changedClients };
}

export function compareWithholdingMonths(
  clients: ClientRecord[],
  prevSession: FilingCheckSessionData | null,
  currSession: FilingCheckSessionData | null,
  prevMonth: number,
  currMonth: number,
): MonthlyCompareResult {
  const changedClients: MonthlyCompareResult['changedClients'] = [];

  for (const c of clients) {
    const prevActive = isActiveTarget(c, prevSession, prevMonth);
    const currActive = isActiveTarget(c, currSession, currMonth);
    if (prevActive === currActive) continue;
    changedClients.push({
      id: c.id,
      companyName: c.companyName,
      businessNo: normalizeBizNo(c.businessNo),
      prevActive,
      currActive,
      change: currActive ? 'added' : 'removed',
    });
  }

  changedClients.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  const prevCount = clients.filter(c => isActiveTarget(c, prevSession, prevMonth)).length;
  const currCount = clients.filter(c => isActiveTarget(c, currSession, currMonth)).length;

  return { prevCount, currCount, diff: currCount - prevCount, changedClients };
}
