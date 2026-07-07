import type { ClientRecord } from '@/app/types/client';
import { SIMPLE_PAYROLL_GRID_COLUMNS, YEAR_END_COLUMNS, SIMPLE_PAYROLL_COLUMNS } from '@/app/types/incomeTypes';
import type { ClientIncomeTypes, IncomeTypeKey, YearEndClientTypes, YearEndIncomeKey } from '@/app/types/incomeTypes';
import { filingTargets, simplePayrollTargetsForPeriod } from '@/app/utils/filingCheck';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import { readIncomeTypes, readYearEndTypes, isLaborContentReportActive } from '@/lib/incomeTypes';
import {
  employedSimplePayrollPeriodKey,
  isEmployedColumnApplicable,
  isSimplePayrollEmployedFilingMonth,
  parseSimplePayrollViewPeriod,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';


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

/** 연말정산 열 활성 — 근로·사업·기타는 간이지급(incomeTypes), 퇴직·이자배당은 yearEndTypes */
export function yearEndColumnActive(
  key: YearEndIncomeKey,
  incomeTypes: ClientIncomeTypes,
  yearEndTypes: YearEndClientTypes,
): boolean {
  if (key === 'employed' || key === 'bizIncome' || key === 'otherTax') {
    return Boolean(incomeTypes[key]);
  }
  return Boolean(yearEndTypes[key]);
}

export function patchYearEndRowFromTypes<T extends { cells: Record<string, IncomeGridCell> }>(
  row: T,
  incomeTypes: ClientIncomeTypes,
  yearEndTypes: YearEndClientTypes,
): T {
  const cells: Record<string, IncomeGridCell> = { ...row.cells };
  for (const col of YEAR_END_COLUMNS) {
    const active = yearEndColumnActive(col.key, incomeTypes, yearEndTypes);
    const prev = cells[col.key] ?? { active: false, filed: false };
    cells[col.key] = { ...prev, active, ...(active ? {} : { filed: false }) };
  }
  return { ...row, cells };
}

export function buildYearEndGrid(
  clients: ClientRecord[],
  year: number,
  filed: YearEndFilingRecord[],
  excluded: Record<string, string> = {},
  rowNotes: Record<string, string> = {},
): IncomeTypeGridRow[] {
  const filedMap = new Map(filed.map(r => [`${r.clientId}|${r.incomeType}`, r]));

  return sortIncomeGridRows(
    filingTargets(clients, 'yearEnd').map(c => {
      const incomeTypes = readIncomeTypes(c.intakeData);
      const yearEndTypes = readYearEndTypes(c.intakeData);
      const cells: Record<string, IncomeGridCell> = {};

      for (const col of YEAR_END_COLUMNS) {
        const active = yearEndColumnActive(col.key, incomeTypes, yearEndTypes);
        const savedRow = filedMap.get(`${c.id}|${col.key}`);
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

/** 신고대상·접수완료 건수 — 열(체크 칸) 단위 합산 */
export function computeIncomeGridStats(
  grid: IncomeTypeGridRow[],
  mode: 'simplePayroll' | 'yearEnd',
  manager?: string,
): { target: number; received: number; diff: number } {
  const rows =
    manager && manager !== '전체'
      ? grid.filter(r => r.manager === manager)
      : grid;

  const columnKeys =
    mode === 'simplePayroll'
      ? SIMPLE_PAYROLL_COLUMNS.map(c => c.key)
      : YEAR_END_COLUMNS.map(c => c.key);

  let target = 0;
  let received = 0;
  for (const row of rows) {
    if (row.excludeReason != null && row.excludeReason !== undefined) continue;
    for (const key of columnKeys) {
      const cell = row.cells[key];
      if (!cell?.active) continue;
      target += 1;
      if (isCellReceivedForStats(cell, key)) received += 1;
    }
  }
  return { target, received, diff: target - received };
}
