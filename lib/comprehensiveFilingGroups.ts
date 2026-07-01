import type { ClientRecord } from '@/app/types/client';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import type { PeriodCompareResult } from '@/lib/filingPeriodCompare';
import { isActiveFilingTarget } from '@/lib/filingPeriodCompare';
import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';

export type ComprehensiveFilingGroup = {
  groupKey: string;
  representative: string;
  residentNo: string;
  douzoneCode: string;
  primaryClientId: string;
  clients: ClientRecord[];
  displayCompanyLabel: string;
};

function normalizeResidentNo(v: string | undefined | null): string {
  return (v || '').replace(/\D/g, '');
}

function normalizeRepName(v: string | undefined | null): string {
  return (v || '').trim().replace(/\s+/g, '');
}

function sortClientsByCode(a: ClientRecord, b: ClientRecord): number {
  const ca = getClientDouzoneCode(a);
  const cb = getClientDouzoneCode(b);
  if (ca && cb) {
    const da = ca.replace(/\D/g, '');
    const db = cb.replace(/\D/g, '');
    if (da && db) return parseInt(da, 10) - parseInt(db, 10);
    return ca.localeCompare(cb, 'ko', { numeric: true });
  }
  if (ca) return -1;
  if (cb) return 1;
  return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
}

function companyLabel(clients: ClientRecord[]): string {
  const names = clients
    .map(c => c.companyName.trim())
    .filter(Boolean);
  if (names.length === 0) return '(상호 없음)';
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}`;
}

/** 종소세 — 대표자(주민번호) 기준 그룹, 세무사랑 코드 순 */
export function groupComprehensiveFilingTargets(clients: ClientRecord[]): ComprehensiveFilingGroup[] {
  const buckets = new Map<string, ClientRecord[]>();

  for (const c of clients) {
    const rrn = normalizeResidentNo(c.residentNo);
    const rep = normalizeRepName(c.representative);
    const key = rrn.length >= 7 ? `rrn:${rrn}` : rep ? `rep:${rep}` : `id:${c.id}`;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const groups: ComprehensiveFilingGroup[] = [];

  for (const [groupKey, list] of buckets) {
    const sorted = [...list].sort(sortClientsByCode);
    const primary = sorted[0];
    groups.push({
      groupKey,
      representative: primary.representative.trim() || primary.companyName.trim() || '(미입력)',
      residentNo: primary.residentNo.trim(),
      douzoneCode: getClientDouzoneCode(primary),
      primaryClientId: primary.id,
      clients: sorted,
      displayCompanyLabel: companyLabel(sorted),
    });
  }

  groups.sort((a, b) => {
    const da = a.douzoneCode.replace(/\D/g, '');
    const db = b.douzoneCode.replace(/\D/g, '');
    if (da && db) return parseInt(da, 10) - parseInt(db, 10);
    if (da) return -1;
    if (db) return 1;
    return a.representative.localeCompare(b.representative, 'ko');
  });

  return groups;
}

export function formatResidentNoDisplay(value: string): string {
  const d = normalizeResidentNo(value);
  if (d.length === 13) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return value.trim() || '-';
}

/** 종소세 — 대표자 그룹 기준 직전 신고 대비 */
export function compareComprehensiveGroups(
  prevGroups: ComprehensiveFilingGroup[],
  currGroups: ComprehensiveFilingGroup[],
  prevSession: FilingCheckSessionData | null,
  currSession: FilingCheckSessionData | null,
): PeriodCompareResult {
  const prevMap = new Map(prevGroups.map(g => [g.groupKey, g]));
  const currMap = new Map(currGroups.map(g => [g.groupKey, g]));
  const allKeys = new Set([...prevMap.keys(), ...currMap.keys()]);
  const changedClients: PeriodCompareResult['changedClients'] = [];
  let prevCount = 0;
  let currCount = 0;

  for (const key of allKeys) {
    const prevG = prevMap.get(key);
    const currG = currMap.get(key);
    const prevActive = prevG
      ? isActiveFilingTarget(prevG.primaryClientId, prevSession)
      : false;
    const currActive = currG
      ? isActiveFilingTarget(currG.primaryClientId, currSession)
      : false;
    if (prevActive) prevCount += 1;
    if (currActive) currCount += 1;
    if (prevActive === currActive) continue;
    const g = currG ?? prevG!;
    changedClients.push({
      id: g.primaryClientId,
      companyName: g.representative,
      businessNo: formatResidentNoDisplay(g.residentNo),
      prevActive,
      currActive,
      change: currActive ? 'added' : 'removed',
    });
  }

  changedClients.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  return { prevCount, currCount, diff: currCount - prevCount, changedClients };
}
