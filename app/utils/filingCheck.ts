import type { TaxTypeId } from '@/app/config/taxTypes';
import type { ClientRecord } from '@/app/types/client';
import type { IncomeTypeKey, YearEndIncomeKey } from '@/app/types/incomeTypes';
import {
  getClientCategory,
  SINGO_DAERI,
  NON_BUSINESS_CATEGORY,
  UNUSED_CATEGORY,
  shouldShowComprehensiveOptionalClient,
} from '@/app/utils/clientsGrouping';
import { shouldShowInWithholdingPeriod, simplePayrollMonthlyPeriodKey, type SimplePayrollHalf } from '@/lib/periodUtils';

export type FilingCycle = 'month' | 'vat' | 'year' | 'half';

// 신고대상확인/대시보드에서 쓰는 세목 id
export type FilingTaxId = TaxTypeId | 'businessStatus' | 'yearEnd' | 'simplePayroll';

export const FILING_TAXES: { id: FilingTaxId; label: string; cycle: FilingCycle; icon: string }[] = [
  { id: 'withholding', label: '원천세', cycle: 'month', icon: '💸' },
  { id: 'simplePayroll', label: '간이지급', cycle: 'month', icon: '📋' },
  { id: 'yearEnd', label: '연말정산', cycle: 'year', icon: '🧮' },
  { id: 'vat', label: '부가세', cycle: 'vat', icon: '🧾' },
  { id: 'businessStatus', label: '면세', cycle: 'year', icon: '🆓' },
  { id: 'comprehensive', label: '종소세', cycle: 'year', icon: '💰' },
  { id: 'corporate', label: '법인세', cycle: 'year', icon: '🏢' },
];

export const VAT_PHASES = ['1기 예정', '1기 확정', '2기 예정', '2기 확정'] as const;
export type VatPhase = (typeof VAT_PHASES)[number];

/** 부가세 예정 기간 — 예정신고·예정고지 구분 대상 */
export type VatObligation = '예정신고' | '예정고지' | '확정신고';

export const VAT_OBLIGATIONS: VatObligation[] = ['예정신고', '예정고지', '확정신고'];

import { defaultSimplePayrollHalf, currentMonthlyFilingMonth } from '@/lib/periodUtils';

export type FilingPeriod = {
  year: number;
  month: number; // 원천세
  vatPhase: VatPhase; // 부가세
  half: SimplePayrollHalf; // 간이지급
};

export function getCycle(taxId: FilingTaxId): FilingCycle {
  return FILING_TAXES.find(t => t.id === taxId)?.cycle ?? 'year';
}

export function defaultPeriod(): FilingPeriod {
  const { year, month } = currentMonthlyFilingMonth();
  return {
    year,
    month,
    vatPhase: '1기 확정',
    half: defaultSimplePayrollHalf(month),
  };
}

// 사업자등록번호 → 숫자만 (10자리)
export function normalizeBizNo(v: string | undefined | null): string {
  return (v || '').replace(/\D/g, '');
}

// 기간 라벨 (요약·표시용)
export function periodLabel(taxId: FilingTaxId, p: FilingPeriod): string {
  const cycle = getCycle(taxId);
  if (cycle === 'month') return `${p.year}년 ${p.month}월`;
  if (cycle === 'vat') return `${p.year}년 ${p.vatPhase}`;
  if (taxId === 'simplePayroll') return `${p.year}년 ${p.month}월`;
  if (taxId === 'corporate') return `${p.year}년 사업연도`;
  return `${p.year}년 귀속`;
}

export function periodKey(taxId: FilingTaxId, p: FilingPeriod): string {
  const cycle = getCycle(taxId);
  if (cycle === 'month') return `${p.year}-${String(p.month).padStart(2, '0')}`;
  if (cycle === 'vat') return `${p.year}-${p.vatPhase}`;
  if (taxId === 'simplePayroll') return simplePayrollMonthlyPeriodKey(p.year, p.month);
  return `${p.year}`;
}

// 기간 키 문자열 → FilingPeriod 복원 (지난 신고 라벨 표시용)
export function parsePeriodKey(taxId: FilingTaxId, key: string): FilingPeriod {
  const base = defaultPeriod();
  const cycle = getCycle(taxId);
  if (cycle === 'month') {
    const [y, m] = key.split('-');
    return { ...base, year: Number(y) || base.year, month: Number(m) || base.month };
  }
  if (cycle === 'vat') {
    const idx = key.indexOf('-');
    const y = key.slice(0, idx);
    const phase = key.slice(idx + 1) as VatPhase;
    return {
      ...base,
      year: Number(y) || base.year,
      vatPhase: (VAT_PHASES as readonly string[]).includes(phase) ? phase : base.vatPhase,
    };
  }
  if (taxId === 'simplePayroll') {
    const [y, h] = key.split('-');
    if (h === 'H1' || h === 'H2') {
      return { ...base, year: Number(y) || base.year, month: h === 'H1' ? 7 : 1, half: h };
    }
    const month = Number(h);
    return { ...base, year: Number(y) || base.year, month: month || base.month };
  }
  return { ...base, year: Number(key) || base.year };
}

/** 직전 기간 키 (완료 신고분 승계용) */
export function previousPeriodKey(taxId: FilingTaxId, currentKey: string): string | null {
  const p = parsePeriodKey(taxId, currentKey);
  const cycle = getCycle(taxId);
  if (cycle === 'month') {
    if (p.month <= 1) return `${p.year - 1}-12`;
    return `${p.year}-${String(p.month - 1).padStart(2, '0')}`;
  }
  if (cycle === 'vat') {
    const idx = VAT_PHASES.indexOf(p.vatPhase);
    if (idx <= 0) return `${p.year - 1}-${VAT_PHASES[VAT_PHASES.length - 1]}`;
    return `${p.year}-${VAT_PHASES[idx - 1]}`;
  }
  if (taxId === 'simplePayroll') {
    if (p.month <= 1) return `${p.year - 1}-12`;
    return `${p.year}-${String(p.month - 1).padStart(2, '0')}`;
  }
  const y = Number(currentKey);
  if (!Number.isFinite(y)) return null;
  return String(y - 1);
}

// 법인 여부 — 사업자유형(법인) 또는 수임처관리 대분류(법인)
export function isCorporateClient(c: ClientRecord): boolean {
  return c.businessEntityType === 'corporate' || getClientCategory(c) === '법인';
}

// 비사업자 — 사업자유형(비사업자) 또는 대분류(비사업자)
export function isNonBusinessClient(c: ClientRecord): boolean {
  return c.businessEntityType === 'nonBusiness' || getClientCategory(c) === '비사업자';
}

// 사업자번호가 없거나 000으로 시작(미발급/임시) 여부 → 종소세에만 노출
export function hasPlaceholderBizNo(c: ClientRecord): boolean {
  const b = normalizeBizNo(c.businessNo);
  return b === '' || b.startsWith('000');
}

// 면세사업자 여부 — 과세유형(taxKind)에 '면세' 포함하고 '과세'(겸영 등)는 아님
export function isTaxExemptClient(c: ClientRecord): boolean {
  const k = String(c.intakeData?.taxKind ?? '').replace(/\s/g, '');
  return k.includes('면세') && !k.includes('과세');
}

/** 간이과세자 — taxKind·국세청 과세유형 */
export function isSimplifiedVatClient(c: ClientRecord): boolean {
  const k = String(c.intakeData?.taxKind ?? '').replace(/\s/g, '');
  if (/간이/.test(k)) return true;
  const nts = String(c.intakeData?.ntsTaxType ?? c.intakeData?.taxType ?? '').replace(/\s/g, '');
  return /간이/.test(nts);
}

export function isVatProvisionalPhase(phase: VatPhase): boolean {
  return phase === '1기 예정' || phase === '2기 예정';
}

export const VAT_PROVISIONAL_PHASES: readonly VatPhase[] = ['1기 예정', '2기 예정'];
export const VAT_CONFIRMED_PHASES: readonly VatPhase[] = ['1기 확정', '2기 확정'];

export type VatObligationBucket = 'provisional' | 'confirmed';

export function vatObligationBucket(phase: VatPhase): VatObligationBucket {
  return isVatProvisionalPhase(phase) ? 'provisional' : 'confirmed';
}

function readVatObligationFromMap(
  map: Record<string, string>,
  bucket: VatObligationBucket,
): VatObligation | null {
  const bucketVal = String(map[bucket] ?? '').trim();
  if (bucket === 'provisional') {
    if (bucketVal === '예정고지' || bucketVal === '예정신고') return bucketVal;
    for (const ph of VAT_PROVISIONAL_PHASES) {
      const v = String(map[ph] ?? '').trim();
      if (v === '예정고지' || v === '예정신고') return v;
    }
    return null;
  }
  if (bucketVal === '확정신고') return bucketVal;
  for (const ph of VAT_CONFIRMED_PHASES) {
    const v = String(map[ph] ?? '').trim();
    if (v === '확정신고') return v;
  }
  return null;
}

/** 해당 부가세 기간에 신고·고지 대상인지 (간이=2기 확정만, 법인=4회, 개인 일반=예정+반기 확정) */
export function clientAppliesToVatPhase(c: ClientRecord, phase: VatPhase): boolean {
  if (isSimplifiedVatClient(c)) return phase === '2기 확정';
  if (isCorporateClient(c)) return true;
  // 개인 일반과세 — 예정·반기 확정
  return (
    phase === '1기 예정' ||
    phase === '2기 예정' ||
    phase === '1기 확정' ||
    phase === '2기 확정'
  );
}

/** 부가세 신고·고지 구분 — 예정/확정 버킷별 저장값 승계 (1기→2기) */
export function readVatObligation(c: ClientRecord, phase: VatPhase): VatObligation {
  const bucket = vatObligationBucket(phase);
  const byPhase = c.intakeData?.vatObligationByPhase;
  if (byPhase && typeof byPhase === 'object' && !Array.isArray(byPhase)) {
    const found = readVatObligationFromMap(byPhase as Record<string, string>, bucket);
    if (found) return found;
  }

  if (bucket === 'confirmed') return '확정신고';

  const raw = String(c.intakeData?.vatObligation ?? '').trim();
  if (raw === '예정고지' || raw === '예정신고') return raw;

  return isCorporateClient(c) ? '예정신고' : '예정고지';
}

/** 담당자별 신고·예정고지 대상 수 (예정 기간 전용) */
export function vatObligationManagerCounts(
  clients: ClientRecord[],
  phase: VatPhase,
): { filing: Map<string, number>; notice: Map<string, number> } {
  const filing = new Map<string, number>();
  const notice = new Map<string, number>();
  for (const c of clients) {
    const obligation = readVatObligation(c, phase);
    const k = c.manager?.trim() || '미분류';
    if (isVatFilingObligation(obligation)) {
      filing.set(k, (filing.get(k) ?? 0) + 1);
    } else if (isVatNoticeObligation(obligation)) {
      notice.set(k, (notice.get(k) ?? 0) + 1);
    }
  }
  return { filing, notice };
}

export function isVatFilingObligation(obligation: VatObligation): boolean {
  return obligation === '예정신고' || obligation === '확정신고';
}

export function isVatNoticeObligation(obligation: VatObligation): boolean {
  return obligation === '예정고지';
}

// 법인 면세 — 부가세 기간에 계산서합계표만 제출(부가세 목록에 '합계표제출'로 표시)
export function isVatSummaryOnlyClient(c: ClientRecord): boolean {
  return isCorporateClient(c) && isTaxExemptClient(c);
}

export type FilingTargetOptions = {
  vatPhase?: VatPhase;
};

// 세목별 최초 신고대상 산출
// 공통: 미사용 대분류 제외, 사업자번호가 없거나 000으로 시작하면 종소세에만 노출(나머지 전부 제외)
// 원천세: 신고대리 제외한 모든 업체
// 부가세: 비사업자·(개인)면세 제외 — 단 법인 면세는 합계표 제출 위해 포함
// 면세(사업장현황): 개인 면세사업자
// 법인세: 법인 / 종소세: 개인(법인 아님) — 신고대리·비사업자 개인형은 코드 있을 때 포함
export function filingTargets(
  clients: ClientRecord[],
  taxId: FilingTaxId,
  options?: FilingTargetOptions,
): ClientRecord[] {
  const active = clients.filter(c => getClientCategory(c) !== UNUSED_CATEGORY);

  if (taxId === 'comprehensive') {
    return active.filter(c => {
      if (isCorporateClient(c)) return false;
      const cat = getClientCategory(c);
      if (cat === SINGO_DAERI || cat === NON_BUSINESS_CATEGORY) {
        return shouldShowComprehensiveOptionalClient(c);
      }
      return true;
    });
  }

  // 종소세 외에는 사업자번호 없는/000 시작 업체 제외
  const withBizNo = active.filter(c => !hasPlaceholderBizNo(c));

  if (taxId === 'withholding' || taxId === 'yearEnd' || taxId === 'simplePayroll') {
    return withBizNo.filter(c => getClientCategory(c) !== SINGO_DAERI);
  }
  if (taxId === 'vat') {
    // 과세 + 법인면세(합계표) 포함, 비사업자·개인면세 제외
    let list = withBizNo.filter(
      c => !isNonBusinessClient(c) && (!isTaxExemptClient(c) || isCorporateClient(c)),
    );
    const phase = options?.vatPhase;
    if (phase) {
      list = list.filter(c => clientAppliesToVatPhase(c, phase));
    }
    return list;
  }
  if (taxId === 'businessStatus') {
    return withBizNo.filter(c => isTaxExemptClient(c) && !isCorporateClient(c));
  }
  // corporate
  return withBizNo.filter(isCorporateClient);
}

/** 원천세·간이지급 — 전월 대비 / 그 외 — 직전 신고분 대비 */
export function usesMonthOverMonthCompare(taxId: FilingTaxId): boolean {
  return taxId === 'withholding' || taxId === 'simplePayroll';
}

/** 원천세 — 특정 월 기준 (반기·소득유형 필터 포함) */
export function withholdingTargetsForPeriod(
  clients: ClientRecord[],
  month: number,
): ClientRecord[] {
  return filingTargets(clients, 'withholding').filter(c =>
    shouldShowInWithholdingPeriod(c.intakeData ?? {}, month),
  );
}

/** 간이지급 — 원천세와 동일한 업체·반기·매월 표시 규칙 */
export function simplePayrollTargetsForPeriod(
  clients: ClientRecord[],
  month: number,
): ClientRecord[] {
  return withholdingTargetsForPeriod(clients, month);
}

// 홈택스 접수목록 한 행
export type HometaxFiling = {
  bizNo: string; // 사업자등록번호 10자리
  name: string; // 상호(성명)
  filingType: string; // 신고유형 (정기신고/수정신고/기한후신고/경정청구 등)
  reportName?: string; // 신고서명·종류 (근로/사업 등 구분)
};

export type HometaxParseResult = {
  bizNos: string[]; // 대조용 (10자리, 중복 제거)
  filings: HometaxFiling[]; // 행별 상세
};

// 특이 신고유형(수정·기한후) 집계 1건
export type SpecialFiling = {
  bizNo: string;
  name: string;
  type: string; // '수정신고' | '기한후신고'
  count: number;
};

export function specialFilingKey(bizNo: string, type: string): string {
  return `${bizNo}|${type}`;
}

// 신고유형 → 특이 분류('수정신고'/'기한후신고'/'경정청구') 또는 null
function classifySpecialType(filingType: string): string | null {
  const t = (filingType || '').replace(/\s/g, '');
  if (t.includes('기한후')) return '기한후신고';
  if (t.includes('수정')) return '수정신고';
  if (t.includes('경정')) return '경정청구';
  return null;
}

const REPORT_NAME_HEADER_PATTERNS = [
  '자료명',
  '신고서명',
  '신고서종류',
  '과세표준신고서',
  '세목',
  '신고서',
];

function findReportNameCol(cells: string[]): number {
  for (const pattern of REPORT_NAME_HEADER_PATTERNS) {
    const idx = cells.findIndex(s => s.includes(pattern));
    if (idx >= 0) return idx;
  }
  return -1;
}

type HometaxHeaderCols = {
  nameCol: number;
  bizCol: number;
  typeCol: number;
  reportCol: number;
};

/** 홈택스 제출내역조회결과 (자료명·지급자·성명/상호) */
function findSubmissionHistoryHeader(cells: string[]): HometaxHeaderCols | null {
  const reportCol = cells.findIndex(s => s.includes('자료명'));
  const bizCol = cells.findIndex(s => s.includes('지급자'));
  if (reportCol < 0 || bizCol < 0) return null;
  const nameCol = cells.findIndex(s => s.includes('상호') || s.includes('성명'));
  const typeCol = cells.findIndex(s => s.includes('제출구분') || s.includes('신고유형'));
  return {
    nameCol: nameCol >= 0 ? nameCol : reportCol,
    bizCol,
    typeCol,
    reportCol,
  };
}

/** 홈택스 접수목록 (상호·등록번호·신고유형) */
function findClassicHometaxHeader(cells: string[]): HometaxHeaderCols | null {
  const nameCol = cells.findIndex(s => s.includes('상호') || s.includes('성명'));
  const bizCol = cells.findIndex(s => s.includes('등록번호'));
  if (nameCol < 0 || bizCol < 0) return null;
  return {
    nameCol,
    bizCol,
    typeCol: cells.findIndex(s => s.includes('신고유형')),
    reportCol: findReportNameCol(cells),
  };
}

function findHometaxHeader(cells: string[]): HometaxHeaderCols | null {
  return findSubmissionHistoryHeader(cells) ?? findClassicHometaxHeader(cells);
}

function compactReportText(v: string): string {
  return (v || '').replace(/\s/g, '');
}

/** 접수목록 신고서명 → 간이지급 소득유형 */
export function inferSimplePayrollIncomeType(reportName: string): IncomeTypeKey | null {
  const t = compactReportText(reportName);
  if (!t) return null;
  if (t.includes('근로내용확인')) return 'laborContentReport';
  if (t.includes('일용')) return 'daily';
  if (t.includes('사업')) return 'bizIncome';
  if (t.includes('기타')) return 'otherTax';
  if (t.includes('근로')) return 'employed';
  return null;
}

/** 접수목록 신고서명 → 연말정산 소득유형 */
export function inferYearEndIncomeType(reportName: string): YearEndIncomeKey | null {
  const t = compactReportText(reportName);
  if (!t) return null;
  if (t.includes('퇴직')) return 'retirement';
  if (t.includes('이자') || t.includes('배당')) return 'interestDividend';
  if (t.includes('사업')) return 'bizIncome';
  if (t.includes('기타')) return 'otherTax';
  if (t.includes('근로')) return 'employed';
  return null;
}

export type FilingTypeMapResult<T extends string> = {
  map: Map<string, Set<T>>;
  unmappedRows: number;
  parsedRows: number;
};

/** 접수목록 행별 신고서명 → bizNo별 소득유형 집합 (간이지급) */
export function buildSimplePayrollFilingTypeMap(
  filings: HometaxFiling[],
): FilingTypeMapResult<IncomeTypeKey> {
  const map = new Map<string, Set<IncomeTypeKey>>();
  let unmappedRows = 0;
  for (const f of filings) {
    const biz = normalizeBizNo(f.bizNo);
    if (biz.length !== 10) continue;
    const reportName = f.reportName || '';
    const incomeType = inferSimplePayrollIncomeType(reportName);
    if (!incomeType || incomeType === 'laborContentReport') {
      unmappedRows += 1;
      continue;
    }
    const set = map.get(biz) ?? new Set<IncomeTypeKey>();
    set.add(incomeType);
    map.set(biz, set);
  }
  return { map, unmappedRows, parsedRows: filings.length };
}

/** 접수목록 행별 신고서명 → bizNo별 소득유형 집합 (연말정산) */
export function buildYearEndFilingTypeMap(
  filings: HometaxFiling[],
): FilingTypeMapResult<YearEndIncomeKey> {
  const map = new Map<string, Set<YearEndIncomeKey>>();
  let unmappedRows = 0;
  for (const f of filings) {
    const biz = normalizeBizNo(f.bizNo);
    if (biz.length !== 10) continue;
    const reportName = f.reportName || '';
    const incomeType = inferYearEndIncomeType(reportName);
    if (!incomeType) {
      unmappedRows += 1;
      continue;
    }
    const set = map.get(biz) ?? new Set<YearEndIncomeKey>();
    set.add(incomeType);
    map.set(biz, set);
  }
  return { map, unmappedRows, parsedRows: filings.length };
}

function filterTypeMap<T extends string>(
  source: Map<string, Set<T>>,
  allowed: T[],
): Map<string, Set<T>> {
  const allowedSet = new Set(allowed);
  const out = new Map<string, Set<T>>();
  for (const [biz, types] of source) {
    const filtered = new Set([...types].filter(t => allowedSet.has(t)));
    if (filtered.size > 0) out.set(biz, filtered);
  }
  return out;
}

export function filterSimplePayrollFilingTypes(
  map: Map<string, Set<IncomeTypeKey>>,
  keys: IncomeTypeKey[],
): Map<string, Set<IncomeTypeKey>> {
  return filterTypeMap(map, keys);
}

export function filterYearEndFilingTypes(
  map: Map<string, Set<YearEndIncomeKey>>,
  keys: YearEndIncomeKey[],
): Map<string, Set<YearEndIncomeKey>> {
  return filterTypeMap(map, keys);
}

// 홈택스 접수목록 엑셀 파싱 (상호·사업자번호·신고유형·신고서명)
export async function parseHometaxFile(file: File): Promise<HometaxParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const bizSet = new Set<string>();
  const filings: HometaxFiling[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

    // 헤더 행 탐지 — 제출내역조회결과(자료명·지급자) 또는 접수목록(상호·등록번호)
    let headerIdx = -1;
    let nameCol = -1;
    let bizCol = -1;
    let typeCol = -1;
    let reportCol = -1;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const cells = r.map(c => String(c ?? '').replace(/\s/g, ''));
      const cols = findHometaxHeader(cells);
      if (!cols) continue;
      headerIdx = i;
      nameCol = cols.nameCol;
      bizCol = cols.bizCol;
      typeCol = cols.typeCol;
      reportCol = cols.reportCol;
      break;
    }

    if (headerIdx < 0) {
      // 헤더를 못 찾으면 사업자번호만이라도 회수
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          const d = normalizeBizNo(String(cell ?? ''));
          if (d.length === 10) bizSet.add(d);
        }
      }
      continue;
    }

    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const biz = normalizeBizNo(String(r[bizCol] ?? ''));
      if (biz.length !== 10) continue;
      bizSet.add(biz);
      filings.push({
        bizNo: biz,
        name: String(r[nameCol] ?? '').trim(),
        filingType: typeCol >= 0 ? String(r[typeCol] ?? '').trim() : '',
        reportName:
          reportCol >= 0
            ? String(r[reportCol] ?? '').trim()
            : '',
      });
    }
  }

  return { bizNos: [...bizSet], filings };
}

// 사업자번호+신고유형 기준으로 특이(수정·기한후) 신고 집계
export function extractSpecialFilings(filings: HometaxFiling[]): SpecialFiling[] {
  const map = new Map<string, SpecialFiling>();
  for (const f of filings) {
    const type = classifySpecialType(f.filingType);
    if (!type) continue;
    const key = specialFilingKey(f.bizNo, type);
    const ex = map.get(key);
    if (ex) {
      ex.count += 1;
      if (!ex.name && f.name) ex.name = f.name;
    } else {
      map.set(key, { bizNo: f.bizNo, name: f.name, type, count: 1 });
    }
  }
  // 기한후 → 수정 → 경정청구 순, 그 안에서 상호순
  const order = (t: string) => (t === '기한후신고' ? 0 : t === '수정신고' ? 1 : 2);
  return [...map.values()].sort(
    (a, b) => order(a.type) - order(b.type) || a.name.localeCompare(b.name, 'ko'),
  );
}

// 하위호환: 사업자번호(10자리)만 필요할 때
export async function parseHometaxBizNos(file: File): Promise<string[]> {
  const { bizNos } = await parseHometaxFile(file);
  return bizNos;
}

export type IncomeUploadResult = {
  matched: number;
  checkedCells: number;
  total: number;
  parsedRows: number;
  extraCount: number;
  unmappedRows: number;
  skippedInactive: number;
  target: number;
  received: number;
  diff: number;
};

export function parseIncomeUploadResult(data: Record<string, unknown>): IncomeUploadResult {
  return {
    matched: Number(data.matched ?? 0),
    checkedCells: Number(data.checkedCells ?? data.matched ?? 0),
    total: Number(data.total ?? 0),
    parsedRows: Number(data.parsedRows ?? data.total ?? 0),
    extraCount: Number(data.extraCount ?? 0),
    unmappedRows: Number(data.unmappedRows ?? 0),
    skippedInactive: Number(data.skippedInactive ?? 0),
    target: Number(data.target ?? 0),
    received: Number(data.received ?? 0),
    diff: Number(data.diff ?? 0),
  };
}

/** 간이지급·연말정산 접수목록 업로드 결과 안내 문구 */
export function formatIncomeUploadNotice(result: IncomeUploadResult, taxLabel: string): string {
  const lines: string[] = [];
  lines.push(
    `접수목록 ${result.parsedRows}건 파싱 · ${result.checkedCells}건 자동 체크했습니다.`,
  );
  if (result.target > 0) {
    if (result.diff > 0) {
      lines.push(
        `신고대상 ${result.target}건 중 접수완료 ${result.received}건 — ${result.diff}건 차이가 있습니다.`,
      );
    } else {
      lines.push(`신고대상 ${result.target}건 모두 접수완료되었습니다.`);
    }
  }
  if (result.extraCount > 0) {
    lines.push(
      `접수목록 중 ${result.extraCount}건은 현재 ${taxLabel} 신고대상 수임처와 일치하지 않습니다.`,
    );
  }
  if (result.unmappedRows > 0) {
    lines.push(
      `신고서 구분을 찾지 못해 ${result.unmappedRows}건은 자동 체크하지 않았습니다.`,
    );
  }
  if (result.skippedInactive > 0) {
    lines.push(
      `접수는 있으나 비활성 소득유형 ${result.skippedInactive}건은 체크하지 않았습니다.`,
    );
  }
  return lines.join(' ');
}
