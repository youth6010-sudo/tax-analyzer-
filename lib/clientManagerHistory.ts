import { managerNamesMatch } from '@/app/utils/managerMatch';
import { withholdingDeadlineDate } from '@/lib/periodUtils';
import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';

export type ManagerChangeEntry = {
  clientId: string;
  previousManager: string;
  newManager: string;
  changedAt: string;
};

/** 신고월 마감 시점(아직 마감 전이면 현재) — 이 시점의 담당자가 해당 신고분 담당 */
export function withholdingManagerAsOfDate(
  reportYear: number,
  reportMonth: number,
  now = new Date(),
): Date {
  const deadline = withholdingDeadlineDate(reportYear, reportMonth);
  return now.getTime() <= deadline.getTime() ? now : deadline;
}

/**
 * asOf 시점의 담당자. 이력이 없으면 currentManager.
 * asOf 이후에 일어난 변경은 되감아 복원.
 */
export function managerAsOf(
  currentManager: string,
  changes: ReadonlyArray<Pick<ManagerChangeEntry, 'previousManager' | 'newManager' | 'changedAt'>>,
  asOf: Date,
): string {
  let m = (currentManager || '').trim();
  const asOfMs = asOf.getTime();
  const sorted = [...changes].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  );
  for (const ch of sorted) {
    const t = new Date(ch.changedAt).getTime();
    if (Number.isNaN(t) || t <= asOfMs) continue;
    m = (ch.previousManager || '').trim();
  }
  return m;
}

/** 담당자 이름이 선택 담당(별칭 포함)과 일치하는지 */
export function managerMatchesSelection(
  manager: string | undefined | null,
  selManager: string,
  matchNames: ReadonlySet<string>,
  uncategorized: string,
): boolean {
  const m = manager?.trim() || uncategorized;
  return matchNames.has(m) || managerNamesMatch(m, selManager);
}

export function groupManagerChangesByClient(
  changes: ManagerChangeEntry[],
): Map<string, ManagerChangeEntry[]> {
  const map = new Map<string, ManagerChangeEntry[]>();
  for (const ch of changes) {
    const list = map.get(ch.clientId) ?? [];
    list.push(ch);
    map.set(ch.clientId, list);
  }
  return map;
}

/** 세션에 해당 업체가 등장했는지 (전월 담당 추론용) */
export function sessionTouchesClient(
  session: FilingCheckSessionData | null | undefined,
  clientId: string,
  bizNo?: string,
): boolean {
  if (!session) return false;
  if (session.excluded && Object.prototype.hasOwnProperty.call(session.excluded, clientId)) {
    return true;
  }
  if (session.forceIncluded?.[clientId]) return true;
  if (session.rowNotes?.[clientId]?.trim()) return true;
  if (session.overrides && Object.prototype.hasOwnProperty.call(session.overrides, clientId)) {
    return true;
  }
  if (session.clientOrder?.includes(clientId)) return true;
  if (session.extraClients?.some(e => e.id === clientId)) return true;
  if (bizNo) {
    const biz = bizNo.replace(/\D/g, '');
    if (biz.length === 10 && session.excelBizNos?.some(b => b.replace(/\D/g, '') === biz)) {
      return true;
    }
  }
  return false;
}

/**
 * 이력이 없을 때 — 직전 신고분 세션에 “손댄” 담당자를 전월 담당으로 추정.
 * 여러 담당 세션에 있으면 currentManager 우선.
 */
export function inferPrevManagerFromSessions(
  clientId: string,
  businessNo: string,
  currentManager: string,
  sessions: Array<{ manager: string; data: FilingCheckSessionData }>,
): string | null {
  const touched: string[] = [];
  for (const { manager, data } of sessions) {
    const m = manager.trim();
    if (!m) continue;
    if (sessionTouchesClient(data, clientId, businessNo)) touched.push(m);
  }
  if (touched.length === 0) return null;
  const curr = currentManager.trim();
  if (curr && touched.some(t => managerNamesMatch(t, curr))) return curr;
  return touched[0] ?? null;
}
