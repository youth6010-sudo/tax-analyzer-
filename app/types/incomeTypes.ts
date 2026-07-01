/** 수임처 관리 — 소득 유형 체크박스 (원천세·간이지급명세서 기준) */
export const SIMPLE_PAYROLL_INCOME_KEYS = [
  'employed',
  'daily',
  'laborContentReport',
  'bizIncome',
  'otherTax',
] as const;

export type SimplePayrollIncomeKey = (typeof SIMPLE_PAYROLL_INCOME_KEYS)[number];

export const INCOME_TYPE_KEYS = [
  ...SIMPLE_PAYROLL_INCOME_KEYS,
  'retirement',
] as const;

export type IncomeTypeKey = (typeof INCOME_TYPE_KEYS)[number];

/** 연말정산지급명세서 전용 */
export const YEAR_END_INCOME_KEYS = ['retirement', 'interestDividend'] as const;
export type YearEndIncomeKey = (typeof YEAR_END_INCOME_KEYS)[number];

export type ClientIncomeTypes = Record<IncomeTypeKey, boolean> & {
  interestDividend?: boolean;
};

export type WithholdingSettings = {
  /** 반기 신고대상 업체 */
  semiAnnualTarget: boolean;
  /** 반기 신고대상이면서 매월 신고 리스트에도 표시 */
  semiAnnualMonthlyDisplay: boolean;
};

export const EMPTY_INCOME_TYPES: ClientIncomeTypes = {
  employed: false,
  daily: false,
  bizIncome: false,
  retirement: false,
  otherTax: false,
  laborContentReport: false,
  interestDividend: false,
};

export const INCOME_TYPE_LABELS: Record<IncomeTypeKey, string> = {
  employed: '상용',
  daily: '일용',
  bizIncome: '사업',
  retirement: '퇴직',
  otherTax: '기타',
  laborContentReport: '근로내용확인신고',
};

/** 간이지급명세서 — 신고대상 모달·그리드 표시용 */
export const SIMPLE_PAYROLL_INCOME_LABELS: Record<SimplePayrollIncomeKey, string> = {
  employed: '근로',
  daily: '일용',
  laborContentReport: '근로내용확인신고',
  bizIncome: '사업',
  otherTax: '기타',
};

export const YEAR_END_INCOME_LABELS: Record<YearEndIncomeKey, string> = {
  retirement: '퇴직',
  interestDividend: '이자배당',
};

/** 간이지급명세서 그리드 열 정의 */
export type SimplePayrollGridColumn =
  | { kind: 'filed'; key: IncomeTypeKey; label: string; semiAnnual?: boolean }
  | { kind: 'laborDate'; label: string; group: string }
  | { kind: 'laborMethod'; label: string; group: string };

export const SIMPLE_PAYROLL_GRID_COLUMNS: SimplePayrollGridColumn[] = [
  { kind: 'filed', key: 'employed', label: '근로', semiAnnual: true },
  { kind: 'filed', key: 'daily', label: '일용' },
  { kind: 'laborDate', label: '접수일', group: '근로내용확인신고' },
  { kind: 'laborMethod', label: '접수방법', group: '근로내용확인신고' },
  { kind: 'filed', key: 'bizIncome', label: '사업' },
  { kind: 'filed', key: 'otherTax', label: '기타' },
];

/** @deprecated SIMPLE_PAYROLL_GRID_COLUMNS 사용 */
export const SIMPLE_PAYROLL_COLUMNS = [
  { key: 'employed' as const, label: '근로' },
  { key: 'daily' as const, label: '일용' },
  { key: 'laborContentReport' as const, label: '근로내용확인신고' },
  { key: 'bizIncome' as const, label: '사업' },
  { key: 'otherTax' as const, label: '기타' },
] as const;

export type SimplePayrollColumnKey = (typeof SIMPLE_PAYROLL_COLUMNS)[number]['key'];

/** 연말정산지급명세서 그리드 열 */
export const YEAR_END_COLUMNS = [
  { key: 'retirement' as const, label: '퇴직' },
  { key: 'interestDividend' as const, label: '이자배당' },
] as const;

export type YearEndColumnKey = (typeof YEAR_END_COLUMNS)[number]['key'];
