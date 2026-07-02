import type { ClientRecord } from '@/app/types/client';
import { SIMPLE_PAYROLL_GRID_COLUMNS, YEAR_END_COLUMNS } from '@/app/types/incomeTypes';
import type { ClientIncomeTypes, IncomeTypeKey } from '@/app/types/incomeTypes';
import { filingTargets, normalizeBizNo } from '@/app/utils/filingCheck';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import { readIncomeTypes, readYearEndTypes, yearEndTypeTargets, isLaborContentReportActive } from '@/lib/incomeTypes';
import {
  employedSimplePayrollPeriodKey,
  isSimplePayrollEmployedFilingMonth,
  parseSimplePayrollViewPeriod,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import type { YearEndIncomeKey } from '@/app/types/incomeTypes';

export const AUTO_NO_WH = '원천세 신고내역 없음';

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
): { grid: IncomeTypeGridRow[]; meta: ReturnType<typeof simplePayrollPeriodMeta> } {
  const meta = simplePayrollPeriodMeta(periodKey);
  const { monthlyPeriodKey, employedPeriodKey, employedFilingMonth } = meta;
  const filedMap = new Map(
    filed.map(r => [`${r.periodKey ?? monthlyPeriodKey}|${r.clientId}|${r.incomeType}`, r]),
  );

  const grid = sortIncomeGridRows(
    filingTargets(clients, 'simplePayroll').map(c => {
      const types = readIncomeTypes(c.intakeData);
      const cells: Record<string, IncomeGridCell> = {};

      for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
        if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
        const key = col.key;
        const isEmployed = key === 'employed';
        const storageKey = isEmployed && employedPeriodKey ? employedPeriodKey : monthlyPeriodKey;
        const saved = filedMap.get(`${storageKey}|${c.id}|${key}`);
        const typeOn = types[key as IncomeTypeKey];
        const applicable = isEmployed ? employedFilingMonth : true;
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
  employedFilingMonth: boolean,
): T {
  const cells: Record<string, IncomeGridCell> = { ...row.cells };

  for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
    if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
    const key = col.key;
    const isEmployed = key === 'employed';
    const applicable = isEmployed ? employedFilingMonth : true;
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

export function patchYearEndRowFromTypes<T extends { cells: Record<string, IncomeGridCell> }>(
  row: T,
  types: ReturnType<typeof yearEndTypeTargets>,
): T {
  const yearEnd = yearEndTypeTargets(types);
  const cells: Record<string, IncomeGridCell> = { ...row.cells };
  for (const col of YEAR_END_COLUMNS) {
    const active = yearEnd[col.key as YearEndIncomeKey];
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
  withholdingHistory?: { ids: Set<string>; bizNos: Set<string> },
): IncomeTypeGridRow[] {
  const filedMap = new Map(filed.map(r => [`${r.clientId}|${r.incomeType}`, r]));

  return sortIncomeGridRows(
    filingTargets(clients, 'yearEnd').map(c => {
      const biz = normalizeBizNo(c.businessNo);
      const hasWithholdingHistory =
        !withholdingHistory ||
        withholdingHistory.ids.has(c.id) ||
        (biz !== '' && withholdingHistory.bizNos.has(biz));
      const types = yearEndTypeTargets(readYearEndTypes(c.intakeData));
      const excludeReason =
        excluded[c.id] ?? (withholdingHistory && !hasWithholdingHistory ? AUTO_NO_WH : null);
      const cells: Record<string, IncomeGridCell> = {};

      for (const col of YEAR_END_COLUMNS) {
        const active = types[col.key as YearEndIncomeKey];
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
        excludeReason,
        cells,
      };
    }),
  );
}
