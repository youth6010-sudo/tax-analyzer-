import type {
  ClientIncomeTypes,
  IncomeTypeKey,
  WithholdingSettings,
} from '@/app/types/incomeTypes';
import { EMPTY_INCOME_TYPES, INCOME_TYPE_KEYS, SIMPLE_PAYROLL_INCOME_KEYS } from '@/app/types/incomeTypes';

function yn(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1' || s === 'O';
}

/** 레거시 taxFlags + 근로내역(Y/N) → 통합 소득유형 */
export function migrateIncomeTypes(intakeData: Record<string, unknown>): ClientIncomeTypes {
  const flags =
    intakeData.taxFlags && typeof intakeData.taxFlags === 'object' && !Array.isArray(intakeData.taxFlags)
      ? (intakeData.taxFlags as Record<string, unknown>)
      : {};

  const existing =
    intakeData.incomeTypes && typeof intakeData.incomeTypes === 'object' && !Array.isArray(intakeData.incomeTypes)
      ? (intakeData.incomeTypes as Record<string, unknown>)
      : null;

  const payrollHistory = intakeData.payrollHistory;

  const out: ClientIncomeTypes = { ...EMPTY_INCOME_TYPES };

  for (const key of INCOME_TYPE_KEYS) {
    if (existing && typeof existing[key] === 'boolean') {
      out[key] = existing[key];
    } else if (key === 'laborContentReport') {
      out.laborContentReport = yn(existing?.laborContentReport) || yn(payrollHistory);
    } else if (key in flags) {
      out[key] = yn(flags[key]);
    }
  }

  if (flags.laborContentReport !== undefined) {
    out.laborContentReport = yn(flags.laborContentReport);
  }

  if (existing && typeof existing.interestDividend === 'boolean') {
    out.interestDividend = existing.interestDividend;
  } else {
    out.interestDividend = yn(flags.interestDividend);
  }

  return out;
}

export function readIncomeTypes(intakeData: Record<string, unknown> | null | undefined): ClientIncomeTypes {
  if (!intakeData || typeof intakeData !== 'object') return { ...EMPTY_INCOME_TYPES };
  return migrateIncomeTypes(intakeData);
}

export function readWithholdingSettings(
  intakeData: Record<string, unknown> | null | undefined,
): WithholdingSettings {
  const raw = intakeData?.withholdingSettings;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      semiAnnualTarget: o.semiAnnualTarget === true,
      semiAnnualMonthlyDisplay: o.semiAnnualMonthlyDisplay === true,
    };
  }
  return { semiAnnualTarget: false, semiAnnualMonthlyDisplay: false };
}

/** 저장용 intake_data 패치 — 레거시 taxFlags 정리 */
export function patchIncomeTypes(
  prev: Record<string, unknown>,
  types: Partial<ClientIncomeTypes>,
): Record<string, unknown> {
  const current = migrateIncomeTypes(prev);
  const next: ClientIncomeTypes = { ...current, ...types };
  const intakeData: Record<string, unknown> = { ...prev, incomeTypes: next };

  const prevFlags =
    prev.taxFlags && typeof prev.taxFlags === 'object' && !Array.isArray(prev.taxFlags)
      ? (prev.taxFlags as Record<string, boolean>)
      : {};
  intakeData.taxFlags = {
    ...prevFlags,
    employed: next.employed,
    daily: next.daily,
    retirement: next.retirement,
    bizIncome: next.bizIncome,
    interestDividend: next.interestDividend ?? false,
    otherTax: next.otherTax,
    laborContentReport: next.laborContentReport,
  };

  return intakeData;
}

export function patchWithholdingSettings(
  prev: Record<string, unknown>,
  settings: Partial<WithholdingSettings>,
): Record<string, unknown> {
  const current = readWithholdingSettings(prev);
  return {
    ...prev,
    withholdingSettings: { ...current, ...settings },
  };
}

/** 간이지급명세서 등 — taxFlags·incomeTypes 기준 (원천세 리스트 필터에는 사용 안 함) */
export function hasWithholdingIncomeType(intakeData: Record<string, unknown>): boolean {
  const t = readIncomeTypes(intakeData);
  return INCOME_TYPE_KEYS.some(k => t[k]);
}

/** 간이지급명세서 대상 열 */
export function simplePayrollTargets(types: ClientIncomeTypes): IncomeTypeKey[] {
  return SIMPLE_PAYROLL_INCOME_KEYS.filter(k => types[k]) as IncomeTypeKey[];
}

/** 연말정산지급명세서 유형별 대상 여부 */
export function yearEndTypeTargets(types: ClientIncomeTypes): {
  retirement: boolean;
  interestDividend: boolean;
} {
  return {
    retirement: types.retirement,
    interestDividend: types.interestDividend === true,
  };
}
