import { readWithholdingSettings } from '@/lib/incomeTypes';

/** 원천세 반기 신고 제출월 (1월·7월) */
export const SEMI_ANNUAL_FILING_MONTHS = [1, 7] as const;

export type SimplePayrollHalf = 'H1' | 'H2';

export const SIMPLE_PAYROLL_HALVES: { id: SimplePayrollHalf; label: string }[] = [
  { id: 'H1', label: '상반기 (1~6월)' },
  { id: 'H2', label: '하반기 (7~12월)' },
];

export function isSemiAnnualFilingMonth(month: number): boolean {
  return (SEMI_ANNUAL_FILING_MONTHS as readonly number[]).includes(month);
}

/** 반기 신고대상 + 매월 미표시일 때만 1·7월 제한. 기본은 매월 전체 노출(기존과 동일) */
export function shouldShowInWithholdingPeriod(
  intakeData: Record<string, unknown>,
  month: number,
): boolean {
  const { semiAnnualTarget, semiAnnualMonthlyDisplay } = readWithholdingSettings(intakeData);
  if (!semiAnnualTarget) return true;
  if (semiAnnualMonthlyDisplay) return true;
  return isSemiAnnualFilingMonth(month);
}

export function simplePayrollPeriodKey(year: number, half: SimplePayrollHalf): string {
  return `${year}-${half}`;
}

export function parseSimplePayrollPeriodKey(key: string): { year: number; half: SimplePayrollHalf } {
  const [y, h] = key.split('-');
  const half = h === 'H2' ? 'H2' : 'H1';
  return { year: Number(y) || new Date().getFullYear(), half };
}

export function simplePayrollPeriodLabel(key: string): string {
  const { year, half } = parseSimplePayrollPeriodKey(key);
  const label = half === 'H1' ? '상반기' : '하반기';
  return `${year}년 ${label}`;
}

/** 간이지급 반기에 해당하는 원천세 월 period_key 목록 */
export function withholdingMonthsInHalf(year: number, half: SimplePayrollHalf): string[] {
  const start = half === 'H1' ? 1 : 7;
  const end = half === 'H1' ? 6 : 12;
  const keys: string[] = [];
  for (let m = start; m <= end; m += 1) {
    keys.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

/** 원천세 월별 period_key → 이전 달 */
export function prevWithholdingPeriodKey(periodKey: string): string | null {
  const [y, m] = periodKey.split('-');
  const year = Number(y);
  const month = Number(m);
  if (!year || !month) return null;
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function defaultSimplePayrollHalf(month: number): SimplePayrollHalf {
  return month <= 6 ? 'H1' : 'H2';
}

/**
 * 원천세·간이지급 등 익월 10일 마감 신고분의 기본 귀속 연월.
 * 해당 신고 마감일(10일) 이전이면 전월, 이후면 당월을 신고대상 기본 기간으로 본다.
 * 예) 2026-07-06 → 6월분, 2026-07-15 → 7월분
 */
export function currentMonthlyFilingMonth(now = new Date()): { year: number; month: number } {
  const day = now.getDate();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (day <= 10) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return { year, month };
}

/** 간이지급 월별 period_key (일용·사업·기타·근로내용확인) */
export function simplePayrollMonthlyPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 간이지급 근로(상용) 반기 신고월 — 1월(하반기)·7월(상반기) */
export function isSimplePayrollEmployedFilingMonth(month: number): boolean {
  return month === 1 || month === 7;
}

/** 근로 간이지급 저장용 반기 period_key. 반기 신고월이 아니면 null */
export function employedSimplePayrollPeriodKey(year: number, month: number): string | null {
  if (month === 7) return simplePayrollPeriodKey(year, 'H1');
  if (month === 1) return simplePayrollPeriodKey(year - 1, 'H2');
  return null;
}

/** period_key 파싱 — YYYY-MM(월) 또는 YYYY-H1/H2(레거시) */
export function parseSimplePayrollViewPeriod(periodKey: string): { year: number; month: number } {
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [y, m] = periodKey.split('-');
    return { year: Number(y), month: Number(m) };
  }
  const { year, half } = parseSimplePayrollPeriodKey(periodKey);
  return { year, month: half === 'H1' ? 7 : 1 };
}
