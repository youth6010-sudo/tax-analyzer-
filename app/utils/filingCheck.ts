import type { TaxTypeId } from '@/app/config/taxTypes';
import type { ClientRecord } from '@/app/types/client';
import { getClientCategory, SINGO_DAERI } from '@/app/utils/clientsGrouping';

export type FilingCycle = 'month' | 'vat' | 'year';

// 신고대상확인/대시보드에서 쓰는 세목 id (세목 4종 + 사업장현황신고)
export type FilingTaxId = TaxTypeId | 'businessStatus';

// 신고대상확인 대상 세목 (원천세·부가세·사업장현황·종소세·법인세)
export const FILING_TAXES: { id: FilingTaxId; label: string; cycle: FilingCycle; icon: string }[] = [
  { id: 'withholding', label: '원천세', cycle: 'month', icon: '💸' },
  { id: 'vat', label: '부가세', cycle: 'vat', icon: '🧾' },
  { id: 'businessStatus', label: '사업장현황', cycle: 'year', icon: '🏪' },
  { id: 'comprehensive', label: '종소세', cycle: 'year', icon: '🧮' },
  { id: 'corporate', label: '법인세', cycle: 'year', icon: '🏢' },
];

export const VAT_PHASES = ['1기 예정', '1기 확정', '2기 예정', '2기 확정'] as const;
export type VatPhase = (typeof VAT_PHASES)[number];

export type FilingPeriod = {
  year: number;
  month: number; // 원천세
  vatPhase: VatPhase; // 부가세
};

export function getCycle(taxId: FilingTaxId): FilingCycle {
  return FILING_TAXES.find(t => t.id === taxId)?.cycle ?? 'year';
}

export function defaultPeriod(): FilingPeriod {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, vatPhase: '1기 확정' };
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
  if (taxId === 'corporate') return `${p.year}년 사업연도`;
  return `${p.year}년 귀속`; // 종소세·사업장현황
}

// 저장/조회용 기간 키
export function periodKey(taxId: FilingTaxId, p: FilingPeriod): string {
  const cycle = getCycle(taxId);
  if (cycle === 'month') return `${p.year}-${String(p.month).padStart(2, '0')}`;
  if (cycle === 'vat') return `${p.year}-${p.vatPhase}`;
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
  return { ...base, year: Number(key) || base.year };
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

// 세목별 최초 신고대상 산출
// 공통: 사업자번호가 없거나 000으로 시작하면 종소세에만 노출(나머지 전부 제외)
// 원천세: 신고대리 제외한 모든 업체
// 부가세: 비사업자·면세 제외
// 사업장현황: 면세사업자
// 법인세: 법인 / 종소세: 개인(법인 아님) — 사업자번호 없는 건도 포함
export function filingTargets(clients: ClientRecord[], taxId: FilingTaxId): ClientRecord[] {
  if (taxId === 'comprehensive') return clients.filter(c => !isCorporateClient(c));

  // 종소세 외에는 사업자번호 없는/000 시작 업체 제외
  const withBizNo = clients.filter(c => !hasPlaceholderBizNo(c));

  if (taxId === 'withholding') {
    return withBizNo.filter(c => getClientCategory(c) !== SINGO_DAERI);
  }
  if (taxId === 'vat') {
    return withBizNo.filter(c => !isNonBusinessClient(c) && !isTaxExemptClient(c));
  }
  if (taxId === 'businessStatus') {
    return withBizNo.filter(isTaxExemptClient);
  }
  // corporate
  return withBizNo.filter(isCorporateClient);
}

// 홈택스 접수목록 한 행
export type HometaxFiling = {
  bizNo: string; // 사업자등록번호 10자리
  name: string; // 상호(성명)
  filingType: string; // 신고유형 (정기신고/수정신고/기한후신고/경정청구 등)
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

// 홈택스 접수목록 엑셀 파싱 (상호·사업자번호·신고유형)
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

    // 헤더 행 탐지 (상호 + 등록번호 컬럼이 있는 행)
    let headerIdx = -1;
    let nameCol = -1;
    let bizCol = -1;
    let typeCol = -1;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const cells = r.map(c => String(c ?? '').replace(/\s/g, ''));
      const ni = cells.findIndex(s => s.includes('상호') || s.includes('성명'));
      const bi = cells.findIndex(s => s.includes('등록번호'));
      const ti = cells.findIndex(s => s.includes('신고유형'));
      if (ni >= 0 && bi >= 0) {
        headerIdx = i;
        nameCol = ni;
        bizCol = bi;
        typeCol = ti;
        break;
      }
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
