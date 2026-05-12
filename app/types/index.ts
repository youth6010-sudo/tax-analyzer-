export interface IndustryRate {
  code: string;
  name: string;        // 업태명
  subClass: string;    // 세세분류
  simpleRateGeneral: number | null;
  simpleRateExcess: number | null;
  standardRate: number | null;
}

export interface ExpenseItem {
  label: string;
  amount: number;
  ratio?: number;
}

export interface TaxReportData {
  caseType: 'A' | 'B' | 'UNKNOWN';
  incomeTypeCode: string;
  reportTypeCode: string;
  industryCode: string;
  totalRevenue: number;
  totalExpenses: number;
  expenseItems: ExpenseItem[];
  rawText?: string;
}

export interface AnalysisResult {
  reportData: TaxReportData;
  industryRate: IndustryRate | null;
  netIncome: number;
  netIncomeRatio: number;
  simpleExpenseRate: number | null;
  simpleBaseIncome: number | null;      // 단순경비율 기준 소득금액
  historicalRatio: number | null;       // 과거 표준 대비 소득율
  diffFromSimpleRate: number | null;
  expenseRatios: ExpenseItem[];
}

// ─── 2025 시뮬레이션 ───────────────────────────────────────────
export interface SimulationInput {
  industryCode: string;
  expectedRevenue: number;
  targetPct: number;   // 80 | 90 | 100 | 110 | 120
}

export interface SimulationResult {
  industryRate: IndustryRate | null;
  simpleExpenseRate: number | null;
  baseIncome: number;        // 기준 소득금액 (100%)
  targetIncome: number;      // 목표 소득금액
  requiredExpense: number;   // 필요 경비 가이드
}

// ─── GAP 분석 ──────────────────────────────────────────────────
export interface GapItem {
  label: string;
  amount: number;
}

export interface GapAnalysis {
  items: GapItem[];
  totalActual: number;
  requiredExpense: number;   // 시뮬레이션 결과값
  gap: number;               // totalActual - requiredExpense (양수=초과, 음수=부족)
}

export type ParseStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: AnalysisResult }
  | { status: 'error'; message: string };
