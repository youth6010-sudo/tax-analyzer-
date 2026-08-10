import type { ClientRecord } from '@/app/types/client';
import { SIMPLE_PAYROLL_STAT_COLUMNS } from '@/app/types/incomeTypes';
import { normalizeBizNo, filingTargets } from '@/app/utils/filingCheck';
import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';
import {
  isSemiAnnualOffMonthExcluded,
  isSimplePayrollEmployedFilingMonth,
  parseSimplePayrollViewPeriod,
} from '@/lib/periodUtils';
import { type IncomeTypeGridRow } from '@/lib/incomeTypeFilingGrid';

type SpCompareRow = {
  clientId: string;
  companyName: string;
  businessNo: string;
  cells: IncomeTypeGridRow['cells'];
};

function isWithholdingPoolClient(c: ClientRecord): boolean {
  return filingTargets([c], 'withholding').length === 1;
}

function isActiveInSessionPool(
  c: ClientRecord,
  session: FilingCheckSessionData | null,
  opts: { semiAnnualOffMonth?: number },
): boolean {
  if (!isWithholdingPoolClient(c)) return false;
  if (
    opts.semiAnnualOffMonth != null &&
    isSemiAnnualOffMonthExcluded(c.intakeData ?? {}, opts.semiAnnualOffMonth)
  ) {
    return false;
  }
  if (session?.excluded && Object.prototype.hasOwnProperty.call(session.excluded, c.id)) {
    return false;
  }
  return true;
}

export type PeriodCompareClientChange = {
  id: string;
  companyName: string;
  businessNo: string;
  prevActive: boolean;
  currActive: boolean;
  change: 'added' | 'removed' | 'unchanged';
};

export type MonthlyCompareResult = {
  prevCount: number;
  currCount: number;
  diff: number;
  /** 이전 기간과 달라진 업체 (신규·제외·복귀) */
  changedClients: PeriodCompareClientChange[];
};

/** 간이지급 — 소득유형(항목)별 전월/직전반기 대비 */
export type PeriodCompareColumnDiff = {
  key: string;
  label: string;
  /** 비교 기준 기간 라벨 (예: 5월 귀속 / 직전 반기) */
  prevPeriodLabel: string;
  prevCount: number;
  currCount: number;
  diff: number;
  changedClients: PeriodCompareClientChange[];
};

export type PeriodCompareResult = MonthlyCompareResult & {
  byColumn?: PeriodCompareColumnDiff[];
};

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

function comparePoolSessions(
  clients: ClientRecord[],
  prevSession: FilingCheckSessionData | null,
  currSession: FilingCheckSessionData | null,
  prevOpts: { semiAnnualOffMonth?: number },
  currOpts: { semiAnnualOffMonth?: number },
): MonthlyCompareResult {
  const changedClients: MonthlyCompareResult['changedClients'] = [];

  for (const c of clients) {
    const prevActive = isActiveInSessionPool(c, prevSession, prevOpts);
    const currActive = isActiveInSessionPool(c, currSession, currOpts);
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

  const prevCount = clients.filter(c => isActiveInSessionPool(c, prevSession, prevOpts)).length;
  const currCount = clients.filter(c => isActiveInSessionPool(c, currSession, currOpts)).length;

  return { prevCount, currCount, diff: currCount - prevCount, changedClients };
}

export function compareWithholdingMonths(
  clients: ClientRecord[],
  prevSession: FilingCheckSessionData | null,
  currSession: FilingCheckSessionData | null,
  prevMonth: number,
  currMonth: number,
): MonthlyCompareResult {
  return comparePoolSessions(
    clients,
    prevSession,
    currSession,
    { semiAnnualOffMonth: prevMonth },
    { semiAnnualOffMonth: currMonth },
  );
}

function attrMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월 귀속`;
}

function employedPrevPeriodLabel(employedViewKey: string): string {
  const { year, month } = parseSimplePayrollViewPeriod(employedViewKey);
  const half = month === 6 ? '상반기' : '하반기';
  return `직전 반기(${half} · ${attrMonthLabel(year, month)})`;
}

function compareColumnActive(
  key: string,
  prevGrid: SpCompareRow[],
  currGrid: SpCompareRow[],
): { prevCount: number; currCount: number; changedClients: PeriodCompareClientChange[] } {
  const prevMap = new Map(prevGrid.map(r => [r.clientId, r]));
  const currMap = new Map(currGrid.map(r => [r.clientId, r]));
  const allIds = new Set([...prevMap.keys(), ...currMap.keys()]);
  const changedClients: PeriodCompareClientChange[] = [];
  let prevCount = 0;
  let currCount = 0;

  for (const id of allIds) {
    const prevRow = prevMap.get(id);
    const currRow = currMap.get(id);
    const prevActive = !!prevRow?.cells[key]?.active;
    const currActive = !!currRow?.cells[key]?.active;
    if (prevActive) prevCount += 1;
    if (currActive) currCount += 1;
    if (prevActive === currActive) continue;
    const row = currRow ?? prevRow!;
    changedClients.push({
      id,
      companyName: row.companyName,
      businessNo: normalizeBizNo(row.businessNo),
      prevActive,
      currActive,
      change: currActive ? 'added' : 'removed',
    });
  }

  changedClients.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  return { prevCount, currCount, changedClients };
}

/**
 * 간이지급 전월대비 — 항목별 활성 칸 비교.
 * 근로: 직전 반기(귀속 6↔12) / 일용·사업·기타: 달력 직전 달
 */
export function compareSimplePayrollByColumns(opts: {
  currGrid: SpCompareRow[];
  prevMonthlyGrid: SpCompareRow[];
  prevEmployedGrid: SpCompareRow[] | null;
  monthlyPrevKey: string | null;
  employedPrevViewKey: string | null;
  currMonth: number;
}): PeriodCompareResult {
  const {
    currGrid,
    prevMonthlyGrid,
    prevEmployedGrid,
    monthlyPrevKey,
    employedPrevViewKey,
    currMonth,
  } = opts;

  const monthlyPrevLabel = monthlyPrevKey
    ? (() => {
        const { year, month } = parseSimplePayrollViewPeriod(monthlyPrevKey);
        return attrMonthLabel(year, month);
      })()
    : '전월';

  const byColumn: PeriodCompareColumnDiff[] = [];
  let prevTotal = 0;
  let currTotal = 0;
  const flatChanged: PeriodCompareClientChange[] = [];
  const seenChange = new Set<string>();

  for (const col of SIMPLE_PAYROLL_STAT_COLUMNS) {
    const isEmployed = col.key === 'employed';
    if (isEmployed && !isSimplePayrollEmployedFilingMonth(currMonth)) {
      continue;
    }
    if (isEmployed && !prevEmployedGrid) {
      continue;
    }

    const prevGrid = isEmployed ? prevEmployedGrid! : prevMonthlyGrid;
    const { prevCount, currCount, changedClients } = compareColumnActive(
      col.key,
      prevGrid,
      currGrid,
    );
    prevTotal += prevCount;
    currTotal += currCount;

    const prevPeriodLabel = isEmployed
      ? employedPrevViewKey
        ? employedPrevPeriodLabel(employedPrevViewKey)
        : '직전 반기'
      : monthlyPrevLabel;

    byColumn.push({
      key: col.key,
      label: col.label,
      prevPeriodLabel,
      prevCount,
      currCount,
      diff: currCount - prevCount,
      changedClients,
    });

    for (const c of changedClients) {
      const k = `${col.key}:${c.id}:${c.change}`;
      if (seenChange.has(k)) continue;
      seenChange.add(k);
      flatChanged.push({
        ...c,
        companyName: `${c.companyName} (${col.label})`,
      });
    }
  }

  flatChanged.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  return {
    prevCount: prevTotal,
    currCount: currTotal,
    diff: currTotal - prevTotal,
    changedClients: flatChanged,
    byColumn,
  };
}
