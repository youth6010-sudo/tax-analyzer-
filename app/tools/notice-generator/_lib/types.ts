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

// 부가세 분납: 납부서(회차)별 날짜·금액
export type PaymentInstallment = {
  date: string; // YYYY-MM-DD
  amount: number; // 회차 납부금액(원)
};

/** 원천세 납부서 3장 이상 — 본세 항목별 금액 */
export type WithholdingItemKey =
  | 'earned'
  | 'business'
  | 'other'
  | 'retirement'
  | 'interest'
  | 'dividend';

export type WithholdingItem = {
  key: WithholdingItemKey;
  enabled: boolean;
  amount: number;
};

// 신고 결과 안내(납부세액) 입력값
export type PaymentNotice = {
  slips: number; // 납부서 장수
  amount: number; // 본세 납부금액(원) · 음수면 환급 — 원천세 2장 이하일 때
  localAmount: number; // 지방소득세(원) · 음수면 환급 — 원천세/종소세/법인세만 사용
  // 원천세 환급 시: 환급 신청 여부 (true=1개월 내 환급, false=다음 신고 시 차감)
  refundClaimed: boolean;
  // 부가세 분납: 납부서 장수만큼 회차별 날짜·금액 (장수 2 이상일 때 사용)
  installments: PaymentInstallment[];
  /** 원천세 납부서 3장 이상 — 항목별 금액 (지방소득세는 localAmount) */
  withholdingItems: WithholdingItem[];
};

// 부가세 매입세액 불공제 (사유별)
export type VatNonDeductibleItem = {
  reason: string;
  vat: number;
};

// 부가세 신고 결과 보고 및 검토 입력값
export type VatReport = {
  salesSupply: number;
  salesVat: number;
  taxInvoiceSupply: number;
  taxInvoiceVat: number;
  fixedAssetSupply: number;
  fixedAssetVat: number;
  cardCashSupply: number;
  cardCashVat: number;
  reductionLabel: string;
  reductionAmount: number;
  /** 매입세액 불공제 — 사유별 금액 */
  nonDeductibleItems: VatNonDeductibleItem[];
  penaltyLabel: string;
  penaltyAmount: number;
  /** 직원 여부 (예: 있음 / 없음) */
  employeeStatus: string;
  /** 차량 관련 — 공제 차량 */
  vehicleDeductible: string;
  /** 차량 관련 — 불공제 차량 */
  vehicleNonDeductible: string;
  /** 종이 세금계산서 해당 시 */
  paperTaxInvoice: string;
  /** 환급 사유 (환급 해당 시) */
  refundReason: string;
  /** 신고 결과 보고 특이사항 */
  vatSpecialNotes: string;
};

export const EMPTY_VAT_REPORT: VatReport = {
  salesSupply: 0,
  salesVat: 0,
  taxInvoiceSupply: 0,
  taxInvoiceVat: 0,
  fixedAssetSupply: 0,
  fixedAssetVat: 0,
  cardCashSupply: 0,
  cardCashVat: 0,
  reductionLabel: '',
  reductionAmount: 0,
  nonDeductibleItems: [],
  penaltyLabel: '',
  penaltyAmount: 0,
  employeeStatus: '',
  vehicleDeductible: '',
  vehicleNonDeductible: '',
  paperTaxInvoice: '',
  refundReason: '',
  vatSpecialNotes: '',
};

export type TaxTypeMeta = {
  key: TaxTypeKey;
  name: string;
  short: string;
  deadlineKind: string;
  accent: AccentKey;
  rule: string;
};
