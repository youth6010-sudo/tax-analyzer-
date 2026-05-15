/** 브라우저 저장·JSON 파일보내기용 스키마 (버전 올리면 이전 파일과 호환 깨질 수 있음) */
export const SESSION_FILE_VERSION = 1 as const;
export const LS_MAIN = 'tax-analyzer-main-v1';
export const LS_SIM = 'tax-analyzer-sim-v1';

export interface SimCustomExpensePersist {
  id: string;
  label: string;
  amount: string;
}

export interface SimPersist {
  rows: { id: string; code: string; revenue: string; targetPct: number }[];
  card: string;
  tax: string;
  loan: string;
  other: string;
  /** 실제 지출 입력 — 사용자 추가 항목 */
  customExpenses?: SimCustomExpensePersist[];
}

export interface MainPersist {
  taxpayer: string;
  prevYear: string;
  currYear: string;
  rows: { id: string; industryCode: string; totalRevenue: string; totalExpenses: string }[];
  rowDetails: Record<string, {
    show: boolean;
    expenses: Record<string, string>;
    customDefs?: { id: string; label: string }[];
  }>;
  analyzed: boolean;
  printExpDetail: boolean;
  printInputExpenseDetail: boolean;
  /** 과세연도(당기 연도 입력) 기준 총수입·경비 명세 — 시뮬레이션 아래 */
  nyRows?: { id: string; industryCode: string; totalRevenue: string; totalExpenses: string }[];
  nyRowDetails?: MainPersist['rowDetails'];
  nyAnalyzed?: boolean;
  nyPrintExpDetail?: boolean;
  /** 시뮬 옵션: 과세연도 기준 총수입·경비 명세 블록 표시 */
  nyDetailSectionOpen?: boolean;
  /** 특이사항 — 내용이 있을 때만 인쇄·PDF·JPG에 포함(입력은 시뮬레이션 영역) */
  nyRemarks?: string;
}

export interface FullSessionFile {
  v: typeof SESSION_FILE_VERSION;
  savedAt: string;
  main: MainPersist;
  sim: SimPersist;
}
