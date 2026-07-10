import type { ClientRecord } from '@/app/types/client';
import {
  SIMPLE_PAYROLL_COLUMNS,
  SIMPLE_PAYROLL_GRID_COLUMNS,
  SIMPLE_PAYROLL_STAT_COLUMNS,
  YEAR_END_COLUMNS,
} from '@/app/types/incomeTypes';
import type { ClientIncomeTypes, IncomeTypeKey, YearEndClientTypes, YearEndIncomeKey } from '@/app/types/incomeTypes';
import { filingTargets, simplePayrollTargetsForPeriod } from '@/app/utils/filingCheck';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import { readIncomeTypes, readYearEndTypes, isLaborContentReportActive } from '@/lib/incomeTypes';
import {
  employedSimplePayrollPeriodKey,
  isEmployedColumnApplicable,
  isSemiAnnualOffMonthExcluded,
  isSimplePayrollEmployedFilingMonth,
  parseSimplePayrollViewPeriod,
  SEMI_ANNUAL_OFF_MONTH_EXCLUDE_REASON,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import { readWithholdingSettings } from '@/lib/incomeTypes';


export type IncomeGridCell = {
  active: boolean;
  applicable?: boolean;
  filed: boolean;
  acceptanceDate?: string;
  acceptanceMethod?: string;
};

export type IncomeTypeGridRow = {
  clientId: string;
  companyName: string;
  representative: string;
  businessNo: string;
  douzoneCode: string;
  manager: string;
  excludeReason: string | null;
  /** 반기 신고대상 — 목록 배지 표시용 */
  semiAnnualTarget?: boolean;
  semiAnnualMonthlyDisplay?: boolean;
  /** 원천세 세션에서 가져온 신고 특이사항 */
  rowNote?: string;
  cells: Record<string, IncomeGridCell>;
};

export type SimplePayrollFilingRecord = {
  periodKey?: string;
  clientId: string;
  incomeType: string;
  filed: boolean;
  acceptanceDate?: string;
  acceptanceMethod?: string;
};

export type YearEndFilingRecord = {
  clientId: string;
  incomeType: string;
  filed: boolean;
};

export function sortIncomeGridRows<T extends { douzoneCode: string; companyName: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ca = a.douzoneCode.replace(/\D/g, '');
    const cb = b.douzoneCode.replace(/\D/g, '');
    if (ca && cb) return parseInt(ca, 10) - parseInt(cb, 10);
    if (ca) return -1;
    if (cb) return 1;
    return a.companyName.localeCompare(b.companyName, 'ko');
  });
}

export function simplePayrollPeriodMeta(periodKey: string) {
  const { year, month } = parseSimplePayrollViewPeriod(periodKey);
  const monthlyPeriodKey = simplePayrollMonthlyPeriodKey(year, month);
  const employedPeriodKey = employedSimplePayrollPeriodKey(year, month);
  const employedFilingMonth = isSimplePayrollEmployedFilingMonth(month);
  return { year, month, monthlyPeriodKey, employedPeriodKey, employedFilingMonth };
}

export function buildSimplePayrollGrid(
  clients: ClientRecord[],
  periodKey: string,
  filed: SimplePayrollFilingRecord[],
  excluded: Record<string, string> = {},
  rowNotes: Record<string, string> = {},
  forceIncluded: Record<string, boolean> = {},
): { grid: IncomeTypeGridRow[]; meta: ReturnType<typeof simplePayrollPeriodMeta> } {
  const meta = simplePayrollPeriodMeta(periodKey);
  const { monthlyPeriodKey, employedPeriodKey, employedFilingMonth } = meta;
  const filedMap = new Map(
    filed.map(r => [`${r.periodKey ?? monthlyPeriodKey}|${r.clientId}|${r.incomeType}`, r]),
  );

  const grid = sortIncomeGridRows(
    simplePayrollTargetsForPeriod(clients, meta.month).map(c => {
      const types = readIncomeTypes(c.intakeData);
      const intakeData = c.intakeData ?? {};
      const whSettings = readWithholdingSettings(intakeData);
      const cells: Record<string, IncomeGridCell> = {};

      for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
        if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
        const key = col.key;
        const isEmployed = key === 'employed';
        const storageKey = isEmployed && employedPeriodKey ? employedPeriodKey : monthlyPeriodKey;
        const saved = filedMap.get(`${storageKey}|${c.id}|${key}`);
        const typeOn = types[key as IncomeTypeKey];
        const applicable = isEmployed ? isEmployedColumnApplicable(meta.month, intakeData) : true;
        cells[key] = {
          applicable,
          active: typeOn && applicable,
          filed: saved?.filed ?? false,
          acceptanceDate: saved?.acceptanceDate ?? '',
          acceptanceMethod: saved?.acceptanceMethod ?? '',
        };
      }

      const laborSaved = filedMap.get(`${monthlyPeriodKey}|${c.id}|laborContentReport`);
      cells.laborContentReport = {
        applicable: true,
        active: isLaborContentReportActive(types),
        filed: laborSaved?.filed ?? false,
        acceptanceDate: laborSaved?.acceptanceDate ?? '',
        acceptanceMethod: laborSaved?.acceptanceMethod ?? '',
      };

      const manualExcluded = Object.prototype.hasOwnProperty.call(excluded, c.id);
      const forced = Boolean(forceIncluded[c.id]);
      const autoSemi =
        !manualExcluded &&
        !forced &&
        isSemiAnnualOffMonthExcluded(intakeData, meta.month);

      return {
        clientId: c.id,
        companyName: c.companyName,
        representative: c.representative,
        businessNo: c.businessNo,
        douzoneCode: getClientDouzoneCode(c) || '',
        manager: c.manager ?? '',
        excludeReason: manualExcluded
          ? (excluded[c.id] ?? '')
          : autoSemi
            ? SEMI_ANNUAL_OFF_MONTH_EXCLUDE_REASON
            : null,
        rowNote: rowNotes[c.id] ?? '',
        semiAnnualTarget: whSettings.semiAnnualTarget,
        semiAnnualMonthlyDisplay: whSettings.semiAnnualMonthlyDisplay,
        cells,
      };
    }),
  );

  return { grid, meta };
}

/** 설정 저장 후 한 업체 행만 소득유형 반영 */
export function patchSimplePayrollRowFromTypes<T extends { cells: Record<string, IncomeGridCell> }>(
  row: T,
  types: ClientIncomeTypes,
  month: number,
  intakeData: Record<string, unknown> = {},
): T {
  const cells: Record<string, IncomeGridCell> = { ...row.cells };

  for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
    if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
    const key = col.key;
    const isEmployed = key === 'employed';
    const applicable = isEmployed ? isEmployedColumnApplicable(month, intakeData) : true;
    const typeOn = types[key as IncomeTypeKey];
    const prev = cells[key] ?? { active: false, filed: false };
    cells[key] = {
      ...prev,
      applicable,
      active: typeOn && applicable,
      ...(typeOn && applicable ? {} : { filed: false, acceptanceDate: '', acceptanceMethod: '' }),
    };
  }

  const laborActive = isLaborContentReportActive(types);
  const prevLabor = cells.laborContentReport ?? { active: false, filed: false };
  cells.laborContentReport = {
    ...prevLabor,
    applicable: true,
    active: laborActive,
    ...(laborActive ? {} : { filed: false, acceptanceDate: '', acceptanceMethod: '' }),
  };

  return { ...row, cells };
}

/**
 * 연말정산 열 활성
 * - 근로·사업·기타: 간이지급 월별 설정(incomeTypes) OR 같은 해 간이지급 접수 이력
 *   (월별로 꺼도 해당 연도 접수가 있으면 연말에 표시 — incomeTypes를 다시 켜지 않음)
 * - 퇴직·이자배당: yearEndTypes
 */
export function yearEndColumnActive(
  key: YearEndIncomeKey,
  incomeTypes: ClientIncomeTypes,
  yearEndTypes: YearEndClientTypes,
  yearSimplePayrollFiled?: ReadonlySet<string>,
): boolean {
  if (key === 'employed' || key === 'bizIncome' || key === 'otherTax') {
    return Boolean(incomeTypes[key]) || Boolean(yearSimplePayrollFiled?.has(key));
  }
  return Boolean(yearEndTypes[key]);
}

export function patchYearEndRowFromTypes<T extends { cells: Record<string, IncomeGridCell> }>(
  row: T,
  incomeTypes: ClientIncomeTypes,
  yearEndTypes: YearEndClientTypes,
  yearSimplePayrollFiled?: ReadonlySet<string>,
): T {
  const cells: Record<string, IncomeGridCell> = { ...row.cells };
  for (const col of YEAR_END_COLUMNS) {
    const prev = cells[col.key] ?? { active: false, filed: false };
    // 같은 해 간이지급·연말 접수 이력이 있으면 설정이 꺼져 있어도 표시·접수 유지
    const active =
      yearEndColumnActive(col.key, incomeTypes, yearEndTypes, yearSimplePayrollFiled) ||
      Boolean(prev.filed);
    cells[col.key] = { ...prev, active };
  }
  return { ...row, cells };
}

export function buildYearEndGrid(
  clients: ClientRecord[],
  year: number,
  filed: YearEndFilingRecord[],
  excluded: Record<string, string> = {},
  rowNotes: Record<string, string> = {},
  /** 같은 해 간이지급에서 접수된 유형 (clientId → incomeType set) */
  yearSimplePayrollFiled: Map<string, ReadonlySet<string>> = new Map(),
): IncomeTypeGridRow[] {
  const filedMap = new Map(filed.map(r => [`${r.clientId}|${r.incomeType}`, r]));

  return sortIncomeGridRows(
    filingTargets(clients, 'yearEnd').map(c => {
      const incomeTypes = readIncomeTypes(c.intakeData);
      const yearEndTypes = readYearEndTypes(c.intakeData);
      const simpleFiled = yearSimplePayrollFiled.get(c.id);
      const cells: Record<string, IncomeGridCell> = {};

      for (const col of YEAR_END_COLUMNS) {
        const savedRow = filedMap.get(`${c.id}|${col.key}`);
        const active =
          yearEndColumnActive(col.key, incomeTypes, yearEndTypes, simpleFiled) ||
          Boolean(savedRow?.filed);
        cells[col.key] = {
          active,
          filed: savedRow?.filed ?? false,
        };
      }

      return {
        clientId: c.id,
        companyName: c.companyName,
        representative: c.representative,
        businessNo: c.businessNo,
        douzoneCode: getClientDouzoneCode(c) || '',
        manager: c.manager ?? '',
        excludeReason: excluded[c.id] ?? null,
        rowNote: rowNotes[c.id] ?? '',
        cells,
      };
    }),
  );
}

function isCellReceivedForStats(
  cell: IncomeGridCell | undefined,
  key: string,
): boolean {
  if (!cell?.active) return false;
  if (key === 'laborContentReport') {
    return (
      cell.filed ||
      !!(cell.acceptanceDate?.trim() || cell.acceptanceMethod?.trim())
    );
  }
  return cell.filed;
}

function incomeGridRowsForManager(
  grid: IncomeTypeGridRow[],
  manager?: string,
): IncomeTypeGridRow[] {
  return manager && manager !== '전체'
    ? grid.filter(r => r.manager === manager)
    : grid;
}

function incomeStatColumnKeys(mode: 'simplePayroll' | 'yearEnd'): string[] {
  return mode === 'simplePayroll'
    ? SIMPLE_PAYROLL_STAT_COLUMNS.map(c => c.key)
    : YEAR_END_COLUMNS.map(c => c.key);
}

/** 미접수 안내용 열 — 간이지급은 근로내용확인신고 포함 */
function incomeNoticeColumns(
  mode: 'simplePayroll' | 'yearEnd',
): { key: string; label: string }[] {
  if (mode === 'simplePayroll') {
    return SIMPLE_PAYROLL_COLUMNS.map(c => ({ key: c.key, label: c.label }));
  }
  return YEAR_END_COLUMNS.map(c => ({ key: c.key, label: c.label }));
}

/** 신고대상·접수완료 건수 — 열(체크 칸) 단위 합산 */
export function computeIncomeGridStats(
  grid: IncomeTypeGridRow[],
  mode: 'simplePayroll' | 'yearEnd',
  manager?: string,
): { target: number; received: number; diff: number } {
  const rows = incomeGridRowsForManager(grid, manager);
  const columnKeys = incomeStatColumnKeys(mode);

  let target = 0;
  let received = 0;
  for (const row of rows) {
    for (const key of columnKeys) {
      const cell = row.cells[key];
      if (!cell?.active) continue;
      target += 1;
      if (isCellReceivedForStats(cell, key)) received += 1;
    }
  }
  return { target, received, diff: target - received };
}

export type UnreceivedByColumn = {
  key: string;
  label: string;
  names: string[];
};

/**
 * 항목(근로·일용·근로내용확인신고…)별 미접수 상호.
 * 활성인데 접수되지 않은 칸만.
 */
export function listUnreceivedByColumn(
  grid: IncomeTypeGridRow[],
  mode: 'simplePayroll' | 'yearEnd',
  manager?: string,
): UnreceivedByColumn[] {
  const rows = incomeGridRowsForManager(grid, manager);
  const columns = incomeNoticeColumns(mode);
  const out: UnreceivedByColumn[] = [];

  for (const { key, label } of columns) {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      // 원천세 제외여도 간이지급·연말정산에서 활성 칸이면 미접수 안내에 포함
      const cell = row.cells[key];
      if (!cell?.active) continue;
      if (isCellReceivedForStats(cell, key)) continue;
      const name = row.companyName?.trim() || '(이름없음)';
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    if (names.length > 0) out.push({ key, label, names });
  }
  return out;
}

/** @deprecated listUnreceivedByColumn 사용 — 상호만 평탄화 */
export function listUnreceivedCompanyNames(
  grid: IncomeTypeGridRow[],
  mode: 'simplePayroll' | 'yearEnd',
  manager?: string,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const col of listUnreceivedByColumn(grid, mode, manager)) {
    for (const n of col.names) {
      if (seen.has(n)) continue;
      seen.add(n);
      names.push(n);
    }
  }
  return names;
}
