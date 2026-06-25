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

// 신고 결과 안내(납부세액) 입력값
export type PaymentNotice = {
  slips: number; // 납부서 장수
  amount: number; // 본세 납부금액(원) · 음수면 환급
  localAmount: number; // 지방소득세(원) · 음수면 환급 — 원천세/종소세/법인세만 사용
  // 원천세 환급 시: 환급 신청 여부 (true=1개월 내 환급, false=다음 신고 시 차감)
  refundClaimed: boolean;
  // 부가세 분납: 납부서 장수만큼 회차별 날짜·금액 (장수 2 이상일 때 사용)
  installments: PaymentInstallment[];
};

// 부가세 신고 결과 보고 및 검토 입력값
export type VatReport = {
  salesSupply: number; // 매출 공급가
  salesVat: number; // 매출 부가세
  taxInvoiceSupply: number; // 매입-세금계산서 공급가
  taxInvoiceVat: number; // 매입-세금계산서 부가세
  fixedAssetSupply: number; // 매입-고정자산 취득 공급가
  fixedAssetVat: number; // 매입-고정자산 취득 부가세
  cardCashSupply: number; // 매입-카드/현금영수증 공급가
  cardCashVat: number; // 매입-카드/현금영수증 부가세
  reductionLabel: string; // 경감세액 명칭
  reductionAmount: number; // 경감세액 금액
};

export type TaxTypeMeta = {
  key: TaxTypeKey;
  name: string;
  short: string;
  deadlineKind: string;
  accent: AccentKey;
  rule: string;
};
