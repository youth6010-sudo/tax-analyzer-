/** 가결산 — 명세서 종류 */
export type StatementKind =
  | 'pl'
  | 'manufacturing'
  | 'construction'
  | 'storage'
  | 'sales'
  | 'transport';

export const STATEMENT_KIND_LABELS: Record<StatementKind, string> = {
  pl: '손익계산서',
  manufacturing: '제조원가명세서',
  construction: '공사원가명세서',
  storage: '보관원가명세서',
  sales: '분양원가명세서',
  transport: '운송원가명세서',
};

export const STATEMENT_KINDS = Object.keys(STATEMENT_KIND_LABELS) as StatementKind[];

/** 환산기준 — 엑셀 N열 */
export type ConvertBasis = '' | '가정치' | '역산' | '실적';

/** 입력기준 — 엑셀 J열 (비율 등) */
export type InputBasis = '비율' | '실적';

export type AccountLine = {
  code: string;
  name: string;
  prior: number;
  current: number;
  source?: StatementKind;
};

export type ReportTemplateRow = {
  r: number;
  code: string;
  name: string;
  inputBasis: string;
  convertBasis: string;
  kind: 'section' | 'account' | 'label' | 'sub';
};

export type AssumptionRow = {
  name: string;
  /** 월별 금액 (키: "7"~"12" 등) */
  byMonth: Record<string, number>;
  note: string;
};

export type InterimClosingManualInputs = {
  /** 기준월 Q2 */
  baseMonth: number;
  /** 조정 H4~H8 (H7=추가인건비) */
  inventoryAdj: number;
  salesAdj: number;
  purchaseAdj: number;
  /** 엑셀 H7 — UI 라벨: 추가인건비 */
  extraCost: number;
  otherCost: number;
  /** 가정치 V~Y */
  assumptions: AssumptionRow[];
  /** 개인/법인 */
  entityType: '개인' | '법인';
  /** 성실기준금액 (억 단위 표시용 문자열 유지: 7.5억) */
  sincereThresholdLabel: string;
  corpSincere: 'Y' | 'N';
  /** 전년도·파란표 연동 U6~U8 / K8~K10 */
  extraExpense: number;
  extraLabor: number;
  extraBonus: number;
  /** 세금 패널 R4~R11 */
  incomeInclusion: number;
  expenseInclusion: number;
  donationExcess: number;
  deductionAmount: number;
  reductionRate: number;
  taxCredit: number;
  minTaxTarget: 'Y' | 'N';
  interimPayment: number;
  /** 12월 환산 입력 T10/T11 · 추가상여 M4/M8 */
  ownerSalaryAnnual: number;
  execSalaryAnnual: number;
  ownerExtraBonus: number;
  execExtraBonus: number;
  ownerDeduction: number;
  execDeduction: number;
  /** 대표·임원 성명 (구분 칸에 대표급여(성명) / 임원급여(성명)으로 표시) */
  confirmName: string;
  confirmRole: string;
  /** 조정사항 아래 특이사항 메모 */
  specialNotes: string;
  /**
   * 감가상각비 당기 — 명세서에 당기값이 없을 때만 엔진이 사용.
   * 전기는 항상 업로드 명세서 값.
   */
  deprConstCurrent: number;
  deprSgnaCurrent: number;
};

export type RowCriteria = {
  inputBasis: InputBasis | string;
  convertBasis: ConvertBasis | string;
};

export type InterimClosingPayload = {
  companyName: string;
  year: number;
  baseMonth: number;
  statements: Partial<Record<StatementKind, AccountLine[]>>;
  manual: InterimClosingManualInputs;
  /** 보고서 행 키(r) → 기준 */
  rowCriteria: Record<string, RowCriteria>;
};

export type ComputedReportRow = {
  key: string;
  excelRow: number;
  code: string;
  name: string;
  kind: ReportTemplateRow['kind'];
  prior: number;
  priorRatio: number | null;
  current: number;
  currentRatio: number | null;
  annualized: number;
  annualizedRatio: number | null;
  inputBasis: string;
  convertBasis: string;
  isSection: boolean;
  /** 다른 계정 합산·수식 행 — 입력/환산기준 미적용 */
  isComputed: boolean;
  /**
   * 엑셀 C열 VLOOKUP 성공 여부.
   * 해당항목표시 매크로(HideRows_IfColumnCEmptyString)는 C가 비면 행 숨김.
   */
  linked: boolean;
};

export type TaxEstimate = {
  netIncome: number;
  incomeInclusion: number;
  expenseInclusion: number;
  incomeAmount: number;
  donationExcess: number;
  taxBase: number;
  calculatedTax: number;
  taxReduction: number;
  taxCredit: number;
  minTax: number;
  determinedTax: number;
  interimPayment: number;
  payable: number;
  rateLabel: string;
};

export type InterimClosingComputed = {
  rows: ComputedReportRow[];
  kpi: {
    /** 엑셀 H3 = L601 세금차감전이익 */
    netIncome: number;
    /** 엑셀 L605 당기순이익 */
    netIncomeAfterTax?: number;
    operatingMargin: number;
    targetOperatingMargin: number;
    adjustedProfit: number;
    totalAdj: number;
    /** 환산 매출액 합 (개인 성실판정용) */
    salesAnnualized: number;
  };
  /** 개인: 매출 ≥ 성실기준금액 → Y / N, 법인이면 '-' */
  personalSincereFlag: 'Y' | 'N' | '-';
  personalTax: TaxEstimate;
  corporateTax: TaxEstimate;
  uploaded: StatementKind[];
};

export function defaultAssumptions(): AssumptionRow[] {
  return [];
}

/** 기준월 다음 달 ~ 12월 (남는 월) */
export function remainingAssumptionMonths(baseMonth: number): number[] {
  const bm = Math.max(1, Math.min(12, Math.round(Number(baseMonth) || 6)));
  const out: number[] = [];
  for (let m = bm + 1; m <= 12; m++) out.push(m);
  return out;
}

export function assumptionMonthTotal(row: AssumptionRow): number {
  return Object.values(row.byMonth || {}).reduce((s, v) => {
    const n = typeof v === 'number' ? v : Number(v);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** 구버전 month11/month12 → byMonth 정규화 */
export function normalizeAssumptionRow(raw: Partial<AssumptionRow> & {
  month11?: number;
  month12?: number;
}): AssumptionRow {
  const byMonth: Record<string, number> = { ...(raw.byMonth || {}) };
  if (raw.month11) byMonth['11'] = Number(raw.month11) || 0;
  if (raw.month12) byMonth['12'] = Number(raw.month12) || 0;
  return {
    name: String(raw.name || ''),
    byMonth,
    note: String(raw.note || ''),
  };
}

/** 환산기준이 가정치인 연동 계정만 가정치 표에 유지. 빈 기본행은 제거 */
export function syncAssumptionsWithReport(
  assumptions: AssumptionRow[],
  rows: { name: string; convertBasis: string; linked?: boolean }[],
): AssumptionRow[] {
  const needed = new Map<string, string>();
  for (const r of rows) {
    const name = (r.name || '').trim();
    const basis = (r.convertBasis || '').trim();
    if (!name || basis !== '가정치') continue;
    if (r.linked !== true) continue;
    const key = name.replace(/\s+/g, '');
    if (!needed.has(key)) needed.set(key, name);
  }

  const byKey = new Map(
    assumptions.map(a => {
      const n = normalizeAssumptionRow(a);
      return [n.name.replace(/\s+/g, ''), n] as const;
    }),
  );
  const out: AssumptionRow[] = [];
  const seen = new Set<string>();

  for (const [key, name] of needed) {
    seen.add(key);
    const prev = byKey.get(key);
    out.push(prev ? { ...prev, name: prev.name || name } : { name, byMonth: {}, note: '' });
  }

  for (const a of assumptions) {
    const n = normalizeAssumptionRow(a);
    const key = n.name.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    if (assumptionMonthTotal(n) || (n.note || '').trim()) {
      out.push(n);
    }
  }
  return out;
}

export function parseSincereThresholdEok(label: string): number {
  const m = String(label ?? '')
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function entityTypeFromClient(c: {
  businessEntityType?: string;
  intakeData?: Record<string, unknown>;
}): '개인' | '법인' {
  const ent = String(c.businessEntityType ?? '').trim();
  if (ent === 'corporate') return '법인';
  if (ent === 'individual' || ent === 'nonBusiness') return '개인';
  const cat = String(c.intakeData?.category ?? '').trim();
  if (cat === '법인') return '법인';
  if (cat === '개인' || cat === '비사업자') return '개인';
  return '법인';
}

export function defaultManualInputs(baseMonth = 6): InterimClosingManualInputs {
  return {
    baseMonth,
    inventoryAdj: 0,
    salesAdj: 0,
    purchaseAdj: 0,
    extraCost: 0,
    otherCost: 0,
    assumptions: defaultAssumptions(),
    entityType: '법인',
    sincereThresholdLabel: '',
    corpSincere: 'N',
    extraExpense: 0,
    extraLabor: 0,
    extraBonus: 0,
    incomeInclusion: 0,
    expenseInclusion: 0,
    donationExcess: 0,
    deductionAmount: 0,
    reductionRate: 0.3,
    taxCredit: 0,
    minTaxTarget: 'Y',
    interimPayment: 0,
    ownerSalaryAnnual: 0,
    execSalaryAnnual: 0,
    ownerExtraBonus: 0,
    execExtraBonus: 0,
    ownerDeduction: 0,
    execDeduction: 0,
    confirmName: '',
    confirmRole: '',
    specialNotes: '',
    deprConstCurrent: 0,
    deprSgnaCurrent: 0,
  };
}

export function emptyPayload(year = new Date().getFullYear(), baseMonth = 6): InterimClosingPayload {
  return {
    companyName: '',
    year,
    baseMonth,
    statements: {},
    manual: defaultManualInputs(baseMonth),
    rowCriteria: {},
  };
}

function stmtNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function codeKey(code: string): string {
  const t = String(code || '').replace(/\s+/g, '');
  if (!t) return '';
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : t;
}

/** 명세서 전체에서 계정코드 찾기 */
export function findStatementLine(
  statements: Partial<Record<string, AccountLine[]>> | undefined,
  code: string,
): AccountLine | null {
  const want = codeKey(code);
  if (!want || !statements) return null;
  for (const lines of Object.values(statements)) {
    if (!Array.isArray(lines)) continue;
    for (const l of lines) {
      if (codeKey(l.code) === want) return l;
    }
  }
  return null;
}

/**
 * 감가상각(618 공사 / 818 판관): 전기는 있는데 당기가 없으면 수동 입력 대상
 */
export function needsDepreciationCurrentInput(
  statements: Partial<Record<string, AccountLine[]>> | undefined,
  code: '618' | '818',
): boolean {
  const hit = findStatementLine(statements, code);
  if (!hit) return false;
  return stmtNum(hit.prior) !== 0 && stmtNum(hit.current) === 0;
}

export function depreciationManualField(
  code: string,
): 'deprConstCurrent' | 'deprSgnaCurrent' | null {
  const c = codeKey(code);
  if (c === '618') return 'deprConstCurrent';
  if (c === '818') return 'deprSgnaCurrent';
  return null;
}
