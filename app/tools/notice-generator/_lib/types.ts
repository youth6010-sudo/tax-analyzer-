export type TaxTypeKey = 'vat' | 'withholding' | 'corporate' | 'income';

export type AccentKey = 'blue' | 'violet' | 'emerald' | 'amber';

export type DeadlineParams = {
  year: number;
  month: number;
  vatPeriodId: string;
  fyEndMonth: number;
  filingTypeId: string;
};

export type SkippedDay = {
  date: string;
  weekday: string;
  reason: string;
};

export type DeadlineResult = {
  periodLabel: string;
  coverage: string;
  coverageStart: Date;
  coverageEnd: Date;
  statutory: Date;
  final: Date;
  wasAdjusted: boolean;
  skipped: SkippedDay[];
  statutoryText: string;
  finalText: string;
};

// 자료 제출 마감 (사용자가 토글로 직접 지정)
export type MaterialDeadline = {
  enabled: boolean;
  date: string; // YYYY-MM-DD
  hour: number; // 9~18
  minute: number; // 0 또는 30
};

export type TaxTypeMeta = {
  key: TaxTypeKey;
  name: string;
  short: string;
  deadlineKind: string;
  accent: AccentKey;
  rule: string;
};
