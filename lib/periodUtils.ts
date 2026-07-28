import { readWithholdingSettings } from '@/lib/incomeTypes';

/** 원천세 반기 신고 제출월 — 지급월 기준 6월(상반기)·12월(하반기) */
export const SEMI_ANNUAL_FILING_MONTHS = [6, 12] as const;

export type SimplePayrollHalf = 'H1' | 'H2';

export const SIMPLE_PAYROLL_HALVES: { id: SimplePayrollHalf; label: string }[] = [
  { id: 'H1', label: '상반기 (1~6월)' },
  { id: 'H2', label: '하반기 (7~12월)' },
];

export function isSemiAnnualFilingMonth(month: number): boolean {
  return (SEMI_ANNUAL_FILING_MONTHS as readonly number[]).includes(month);
}

export const SEMI_ANNUAL_OFF_MONTH_EXCLUDE_REASON = '반기 신고월 아님';

/** 반기 신고대상 업체 여부 */
export function isSemiAnnualWithholdingClient(intakeData: Record<string, unknown>): boolean {
  return readWithholdingSettings(intakeData).semiAnnualTarget;
}

/** 반기 신고대상 + 매월 미표시 + 반기 신고월(6·12월) 아님 → 자동 제외 */
export function isSemiAnnualOffMonthExcluded(
  intakeData: Record<string, unknown>,
  month: number,
): boolean {
  const { semiAnnualTarget, semiAnnualMonthlyDisplay } = readWithholdingSettings(intakeData);
  if (!semiAnnualTarget) return false;
  if (semiAnnualMonthlyDisplay) return false;
  return !isSemiAnnualFilingMonth(month);
}

/** @deprecated 목록 제외 대신 isSemiAnnualOffMonthExcluded 로 자동 제외 처리 */
export function shouldShowInWithholdingPeriod(
  intakeData: Record<string, unknown>,
  _month: number,
): boolean {
  void intakeData;
  void _month;
  return true;
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
 * 원천세·간이지급 등 익월 10일 마감 — UI·기본 선택은 **신고월(마감월)**.
 * - 매월 11일~말일 → 다음달이 신고월 (예: 7/28 → 8월 신고 = 7월 귀속)
 * - 매월 1~10일 → 이번달이 신고월 (예: 8/5 → 8월 신고 = 7월 귀속)
 * 마감일(10일)이 주말이면 다음 평일까지 이전 신고월을 유지합니다.
 */
export function currentMonthlyFilingMonth(now = new Date()): { year: number; month: number } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  const deadline = withholdingDeadlineDate(y, m);
  // 이번 달 마감일(연장 포함)까지는 이번 달이 신고월, 이후면 다음달 신고월
  if (now.getTime() <= deadline.getTime()) {
    return { year: y, month: m };
  }
  let year = y;
  let month = m + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return { year, month };
}

/** 신고월 → 귀속월 (신고 마감월의 지급·귀속 월) */
export function attributionMonthFromReportMonth(
  year: number,
  reportMonth: number,
): { year: number; month: number } {
  let month = reportMonth - 1;
  let y = year;
  if (month < 1) {
    month = 12;
    y -= 1;
  }
  return { year: y, month };
}

/** 귀속월 → 신고월 */
export function reportMonthFromAttributionMonth(
  year: number,
  attributionMonth: number,
): { year: number; month: number } {
  let month = attributionMonth + 1;
  let y = year;
  if (month > 12) {
    month = 1;
    y += 1;
  }
  return { year: y, month };
}

/** 해당 달 원천세 마감일(기본 10일, 토·일이면 다음 평일) */
export function withholdingDeadlineDate(year: number, month: number): Date {
  const d = new Date(year, month - 1, 10, 23, 59, 59, 999);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** 간이지급 월별 period_key (일용·사업·기타·근로내용확인) */
export function simplePayrollMonthlyPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 간이지급 근로(상용) 반기 신고월 — 6월(상반기)·12월(하반기) */
export const SIMPLE_PAYROLL_EMPLOYED_FILING_MONTHS = [6, 12] as const;

export function isSimplePayrollEmployedFilingMonth(month: number): boolean {
  return (SIMPLE_PAYROLL_EMPLOYED_FILING_MONTHS as readonly number[]).includes(month);
}

/**
 * 간이지급 근로(상용) 열 노출 — 원천 반기/매월표시와 무관.
 * 근로 간이지급은 항상 반기 제출이므로 6·12월에만 적용.
 */
export function isEmployedColumnApplicable(
  month: number,
  _intakeData?: Record<string, unknown>,
): boolean {
  void _intakeData;
  return isSimplePayrollEmployedFilingMonth(month);
}

/** 근로 간이지급 저장용 반기 period_key. 반기 신고월이 아니면 null */
export function employedSimplePayrollPeriodKey(year: number, month: number): string | null {
  if (month === 6) return simplePayrollPeriodKey(year, 'H1');
  if (month === 12) return simplePayrollPeriodKey(year, 'H2');
  return null;
}

/** period_key 파싱 — YYYY-MM(월) 또는 YYYY-H1/H2(레거시) */
export function parseSimplePayrollViewPeriod(periodKey: string): { year: number; month: number } {
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [y, m] = periodKey.split('-');
    return { year: Number(y), month: Number(m) };
  }
  const { year, half } = parseSimplePayrollPeriodKey(periodKey);
  return { year, month: half === 'H1' ? 6 : 12 };
}

/** 해당 연도 간이지급 조회용 period_key (월 1~12 + 근로 반기 H1/H2) */
export function simplePayrollPeriodKeysForYear(year: number): string[] {
  const keys: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    keys.push(simplePayrollMonthlyPeriodKey(year, month));
  }
  keys.push(simplePayrollPeriodKey(year, 'H1'));
  keys.push(simplePayrollPeriodKey(year, 'H2'));
  return keys;
}

/**
 * 간이지급 전월(이월) 조회용 period_key.
 * 일반 유형: 직전 달 YYYY-MM / 근로: 직전 반기 H1·H2
 */
export function prevSimplePayrollCarryPeriodKeys(
  year: number,
  month: number,
): { monthly: string | null; employed: string | null } {
  const monthly = prevWithholdingPeriodKey(simplePayrollMonthlyPeriodKey(year, month));
  let employed: string | null = null;
  if (month === 12) employed = simplePayrollPeriodKey(year, 'H1');
  else if (month === 6) employed = simplePayrollPeriodKey(year - 1, 'H2');
  return { monthly, employed };
}
