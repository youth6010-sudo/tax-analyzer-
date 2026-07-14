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
import { readIncomeTypes, readYearEndTypes } from '@/lib/incomeTypes';
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
  /** 해당 월만 비활성(전월 미신고 이월·수동 끔) — DB notes */
  monthInactive?: boolean;
  /** 해당 월 수동 활성화 — 미접수 시 차이 집계 */
  monthForcedActive?: boolean;
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
  notes?: string;
};

/** 해당 월만 체크란 숨김(전월 미신고 이월·수동 비활성) — filed 값은 유지 */
export const SP_MONTH_INACTIVE_NOTE = '__inactive__';
/** 전월 미신고인데 이번 달 수동으로 켠 상태 — 차이(미접수) 집계 대상 */
export const SP_MONTH_ACTIVE_NOTE = '__active__';

export function isSimplePayrollMonthInactive(notes?: string | null): boolean {
  return String(notes || '').includes(SP_MONTH_INACTIVE_NOTE);
}

export function isSimplePayrollMonthForcedActive(notes?: string | null): boolean {
  return String(notes || '').includes(SP_MONTH_ACTIVE_NOTE);
}

export function simplePayrollMonthNotes(opts: {
  monthInactive?: boolean;
  monthForcedActive?: boolean;
}): string {
  if (opts.monthInactive) return SP_MONTH_INACTIVE_NOTE;
  if (opts.monthForcedActive) return SP_MONTH_ACTIVE_NOTE;
  return '';
}

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
  /** 전월(또는 근로 직전 반기) 접수 완료 — clientId|incomeType */
  prevFiledKeys: ReadonlySet<string> = new Set(),
): { grid: IncomeTypeGridRow[]; meta: ReturnType<typeof simplePayrollPeriodMeta> } {
  const meta = simplePayrollPeriodMeta(periodKey);
  const { monthlyPeriodKey, employedPeriodKey, employedFilingMonth } = meta;
  const filedMap = new Map(
    filed.map(r => [`${r.periodKey ?? monthlyPeriodKey}|${r.clientId}|${r.incomeType}`, r]),
  );

  const grid = sortIncomeGridRows(
    simplePayrollTargetsForPeriod(clients, meta.month).map(c => {
      const intakeData = c.intakeData ?? {};
      const whSettings = readWithholdingSettings(intakeData);
      const cells: Record<string, IncomeGridCell> = {};

      for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
        if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
        const key = col.key;
        const isEmployed = key === 'employed';
        const storageKey = isEmployed && employedPeriodKey ? employedPeriodKey : monthlyPeriodKey;
        const saved = filedMap.get(`${storageKey}|${c.id}|${key}`);
        const applicable = isEmployed ? isEmployedColumnApplicable(meta.month, intakeData) : true;
        const monthInactive = isSimplePayrollMonthInactive(saved?.notes);
        const monthForcedActive = isSimplePayrollMonthForcedActive(saved?.notes);
        const prevFiled = prevFiledKeys.has(`${c.id}|${key}`);
        const hasFiled = !!saved?.filed;
        // 전월 신고(접수)됐을 때만 이월 활성. 전월 미신고 → 비활성.
        // 수동 활성화(__active__)면 전월 없어도 활성 → 미접수는 차이.
        // 수동 비활성(__inactive__)이면 전월 신고분이 있어도 숨김.
        const active =
          applicable &&
          !monthInactive &&
          !!(hasFiled || monthForcedActive || prevFiled);
        cells[key] = {
          applicable,
          active,
          filed: hasFiled,
          acceptanceDate: saved?.acceptanceDate ?? '',
          acceptanceMethod: saved?.acceptanceMethod ?? '',
          monthInactive,
          monthForcedActive,
        };
      }

      const laborSaved = filedMap.get(`${monthlyPeriodKey}|${c.id}|laborContentReport`);
      const laborInactive = isSimplePayrollMonthInactive(laborSaved?.notes);
      const laborForced = isSimplePayrollMonthForcedActive(laborSaved?.notes);
      const laborPrev = prevFiledKeys.has(`${c.id}|laborContentReport`);
      const laborFiled = !!laborSaved?.filed;
      cells.laborContentReport = {
        applicable: true,
        active: !laborInactive && !!(laborFiled || laborForced || laborPrev),
        filed: laborFiled,
        acceptanceDate: laborSaved?.acceptanceDate ?? '',
        acceptanceMethod: laborSaved?.acceptanceMethod ?? '',
        monthInactive: laborInactive,
        monthForcedActive: laborForced,
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

/** 설정 저장 후 한 업체 행 — 접수(filed)·월 강제활성/비활성 플래그 유지 */
export function patchSimplePayrollRowFromTypes<T extends { cells: Record<string, IncomeGridCell> }>(
  row: T,
  types: ClientIncomeTypes,
  month: number,
  intakeData: Record<string, unknown> = {},
): T {
  void types;
  const cells: Record<string, IncomeGridCell> = { ...row.cells };

  for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
    if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
    const key = col.key;
    const isEmployed = key === 'employed';
    const applicable = isEmployed ? isEmployedColumnApplicable(month, intakeData) : true;
    const prev = cells[key] ?? { active: false, filed: false };
    const monthInactive = !!prev.monthInactive;
    const monthForcedActive = !!prev.monthForcedActive;
    cells[key] = {
      ...prev,
      applicable,
      active:
        applicable &&
        !monthInactive &&
        !!(prev.filed || monthForcedActive || prev.active),
    };
  }

  const prevLabor = cells.laborContentReport ?? { active: false, filed: false };
  const laborInactive = !!prevLabor.monthInactive;
  const laborForced = !!prevLabor.monthForcedActive;
  cells.laborContentReport = {
    ...prevLabor,
    applicable: true,
    active: !laborInactive && !!(prevLabor.filed || laborForced || prevLabor.active),
  };

  return { ...row, cells };
}

/**
 * 연말정산 열 활성
 * - 근로·사업·기타: 같은 해 간이지급 접수 1회라도 있으면 필수 표시
 *   (+ incomeTypes ON 이거나 연말에 이미 접수한 경우)
 * - 퇴직·이자배당: yearEndTypes
 */
export function yearEndColumnActive(
  key: YearEndIncomeKey,
  incomeTypes: ClientIncomeTypes,
  yearEndTypes: YearEndClientTypes,
  yearSimplePayrollFiled?: ReadonlySet<string>,
): boolean {
  if (key === 'employed' || key === 'bizIncome' || key === 'otherTax') {
    // 당해 간이지급 접수가 있으면 연말정산 대상 (incomeTypes를 꺼도 유지)
    return Boolean(yearSimplePayrollFiled?.has(key)) || Boolean(incomeTypes[key]);
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
