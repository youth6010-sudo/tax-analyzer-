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
  statutory: Date;
  final: Date;
  wasAdjusted: boolean;
  skipped: SkippedDay[];
  statutoryText: string;
  finalText: string;
};

export type TaxTypeMeta = {
  key: TaxTypeKey;
  name: string;
  short: string;
  deadlineKind: string;
  accent: AccentKey;
  rule: string;
};
