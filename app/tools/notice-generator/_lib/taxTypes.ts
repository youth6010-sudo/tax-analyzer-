// 세목 정의 및 신고 기간(과세기간) 옵션, 법정 마감일 규칙 메타데이터
//
// deadlineKind 값에 따라 _lib/deadline.ts 의 계산 분기가 결정됩니다.

import type { AccentKey, TaxTypeKey, TaxTypeMeta } from './types';

export const TAX_TYPES = {
  VAT: 'vat',
  WITHHOLDING: 'withholding',
  CORPORATE: 'corporate',
  INCOME: 'income',
} as const satisfies Record<string, TaxTypeKey>;

export type VatPeriod = {
  id: string;
  label: string;
  shortLabel: string;
  coverage: string;
  // 과세기간 시작/종료 (기준 연도 대비 월·일)
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  dueYearOffset: number;
  dueMonth: number;
  dueDay: number;
};

// 부가가치세 과세기간 옵션
// dueYearOffset: 과세기간 종료가 속한 연도 기준, 마감 "연도 이동"(+1이면 다음해)
// dueMonth/dueDay: 법정 신고 마감 월/일
export const VAT_PERIODS: VatPeriod[] = [
  {
    id: '1-pre',
    label: '1기 예정 (1월~3월)',
    shortLabel: '1기 예정',
    coverage: '1월 1일 ~ 3월 31일',
    startMonth: 1,
    startDay: 1,
    endMonth: 3,
    endDay: 31,
    dueYearOffset: 0,
    dueMonth: 4,
    dueDay: 25,
  },
  {
    id: '1-notice',
    label: '1기 예정고지 (1월~3월)',
    shortLabel: '1기 예정고지',
    coverage: '1월 1일 ~ 3월 31일',
    startMonth: 1,
    startDay: 1,
    endMonth: 3,
    endDay: 31,
    dueYearOffset: 0,
    dueMonth: 4,
    dueDay: 25,
  },
  {
    id: '1-final',
    label: '1기 확정 (4월~6월)',
    shortLabel: '1기 확정',
    coverage: '4월 1일 ~ 6월 30일',
    startMonth: 4,
    startDay: 1,
    endMonth: 6,
    endDay: 30,
    dueYearOffset: 0,
    dueMonth: 7,
    dueDay: 25,
  },
  {
    id: '1-half-final',
    label: '1기 확정 (1월~6월)',
    shortLabel: '1기 확정',
    coverage: '1월 1일 ~ 6월 30일',
    startMonth: 1,
    startDay: 1,
    endMonth: 6,
    endDay: 30,
    dueYearOffset: 0,
    dueMonth: 7,
    dueDay: 25,
  },
  {
    id: '2-pre',
    label: '2기 예정 (7월~9월)',
    shortLabel: '2기 예정',
    coverage: '7월 1일 ~ 9월 30일',
    startMonth: 7,
    startDay: 1,
    endMonth: 9,
    endDay: 30,
    dueYearOffset: 0,
    dueMonth: 10,
    dueDay: 25,
  },
  {
    id: '2-notice',
    label: '2기 예정고지 (7월~9월)',
    shortLabel: '2기 예정고지',
    coverage: '7월 1일 ~ 9월 30일',
    startMonth: 7,
    startDay: 1,
    endMonth: 9,
    endDay: 30,
    dueYearOffset: 0,
    dueMonth: 10,
    dueDay: 25,
  },
  {
    id: '2-final',
    label: '2기 확정 (10월~12월)',
    shortLabel: '2기 확정',
    coverage: '10월 1일 ~ 12월 31일',
    startMonth: 10,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    dueYearOffset: 1,
    dueMonth: 1,
    dueDay: 25,
  },
  {
    id: '2-half-final',
    label: '2기 확정 (7월~12월)',
    shortLabel: '2기 확정',
    coverage: '7월 1일 ~ 12월 31일',
    startMonth: 7,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    dueYearOffset: 1,
    dueMonth: 1,
    dueDay: 25,
  },
  {
    id: 'year-final',
    label: '확정 (1월~12월)',
    shortLabel: '확정',
    coverage: '1월 1일 ~ 12월 31일',
    startMonth: 1,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    dueYearOffset: 1,
    dueMonth: 1,
    dueDay: 25,
  },
];

// 법인세: 사업연도 종료월 선택 → 종료월 말일로부터 3개월이 되는 달의 말일이 마감
export const CORPORATE_FY_END_MONTHS: { id: number; label: string }[] = [
  { id: 12, label: '12월 결산 (일반)' },
  { id: 3, label: '3월 결산' },
  { id: 6, label: '6월 결산' },
  { id: 9, label: '9월 결산' },
];

export const CORP_NOTICE_PHASES = ['중간예납', '확정'] as const;

/** 부가세 예정고지 — 신고 없이 고지세액 납부만 안내 */
export function isVatPreliminaryNotice(vatPeriodId: string | undefined): boolean {
  return vatPeriodId === '1-notice' || vatPeriodId === '2-notice';
}

export type IncomeFilingType = {
  id: string;
  label: string;
  dueMonth: number;
  dueDay: number;
};

// 종합소득세: 기본 5/31, 성실신고확인대상자는 6/30
export const INCOME_FILING_TYPES: IncomeFilingType[] = [
  { id: 'general', label: '일반 신고', dueMonth: 5, dueDay: 31 },
  { id: 'honest', label: '성실신고확인대상', dueMonth: 6, dueDay: 30 },
];

export const TAX_TYPE_META: Record<TaxTypeKey, TaxTypeMeta> = {
  [TAX_TYPES.WITHHOLDING]: {
    key: TAX_TYPES.WITHHOLDING,
    name: '원천세',
    short: '원천징수이행상황신고',
    deadlineKind: 'withholding',
    accent: 'violet',
    rule: '지급 월의 다음 달 10일까지 신고·납부',
  },
  [TAX_TYPES.VAT]: {
    key: TAX_TYPES.VAT,
    name: '부가가치세',
    short: '부가세 신고',
    deadlineKind: 'vat',
    accent: 'blue',
    rule: '과세기간 종료 후 25일까지 신고·납부',
  },
  [TAX_TYPES.CORPORATE]: {
    key: TAX_TYPES.CORPORATE,
    name: '법인세',
    short: '법인세 신고',
    deadlineKind: 'corporate',
    accent: 'emerald',
    rule: '사업연도 종료일이 속한 달의 말일부터 3개월 이내 신고·납부',
  },
  [TAX_TYPES.INCOME]: {
    key: TAX_TYPES.INCOME,
    name: '종합소득세',
    short: '종소세 신고',
    deadlineKind: 'income',
    accent: 'amber',
    rule: '귀속 연도의 다음 해 5월 31일까지 신고·납부 (성실신고대상 6월 30일)',
  },
};

export const TAX_TYPE_LIST: TaxTypeMeta[] = [
  TAX_TYPE_META[TAX_TYPES.VAT],
  TAX_TYPE_META[TAX_TYPES.WITHHOLDING],
  TAX_TYPE_META[TAX_TYPES.CORPORATE],
  TAX_TYPE_META[TAX_TYPES.INCOME],
];

type AccentClass = {
  activeBg: string;
  activeRing: string;
  softBg: string;
  text: string;
  border: string;
  dot: string;
};

// Tailwind 정적 클래스 매핑 (동적 클래스명 생성 회피 → JIT 안전)
export const ACCENT_CLASSES: Record<AccentKey, AccentClass> = {
  blue: {
    activeBg: 'bg-blue-600',
    activeRing: 'ring-blue-500',
    softBg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-500',
    dot: 'bg-blue-500',
  },
  violet: {
    activeBg: 'bg-violet-600',
    activeRing: 'ring-violet-500',
    softBg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-500',
    dot: 'bg-violet-500',
  },
  emerald: {
    activeBg: 'bg-emerald-600',
    activeRing: 'ring-emerald-500',
    softBg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-500',
    dot: 'bg-emerald-500',
  },
  amber: {
    activeBg: 'bg-amber-500',
    activeRing: 'ring-amber-400',
    softBg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-500',
    dot: 'bg-amber-500',
  },
};
