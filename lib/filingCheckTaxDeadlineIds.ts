import type { FilingTaxId } from '@/app/utils/filingCheck';
import { VAT_PHASES, type VatPhase, parsePeriodKey } from '@/app/utils/filingCheck';

/** 부가세 신고대상확인 기수 → 회사일정 tax-vat id */
const VAT_PHASE_TO_DEADLINE_ID: Record<VatPhase, string> = {
  '1기 예정': '1-pre',
  '1기 확정': '1-final',
  '2기 예정': '2-pre',
  '2기 확정': '2-final',
};

/**
 * 간이지급 귀속월 → 회사일정 마감 id
 * 근로내용확인·일용직지급명세서·간이지급명세서
 */
export function simplePayrollRelatedDeadlineIds(year: number, month: number): string[] {
  if (month < 1 || month > 12) return [];
  return [
    `tax-labor-${year}-${month}`,
    `tax-daily-${year}-${month}`,
    `tax-sp-m-${year}-${month}`,
  ];
}

/** 연말정산 귀속연도 → 지급명세서 회사일정 마감 id */
export function yearEndRelatedDeadlineIds(year: number): string[] {
  if (!Number.isFinite(year) || year < 2000) return [];
  return [
    `tax-paystmt-employed-${year}`,
    `tax-paystmt-retirement-${year}`,
    `tax-paystmt-biz-${year}`,
    `tax-paystmt-interest-div-${year}`,
    `tax-paystmt-other-${year}`,
  ];
}

/**
 * 신고대상확인 세션(세목·기간) → 회사일정 세무신고 마감 id 목록
 * (tax_deadline_checkoffs.deadline_id / 캘린더 tax-* id)
 */
export function filingSessionToTaxDeadlineIds(
  taxType: FilingTaxId | string,
  periodKey: string,
): string[] {
  const key = periodKey.trim();
  if (!key) return [];

  if (taxType === 'withholding') {
    const m = key.match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return [];
    return [`tax-wh-${Number(m[1])}-${Number(m[2])}`];
  }

  if (taxType === 'simplePayroll') {
    // YYYY-MM (월별). H1/H2 반기 키는 회사일정에 대응 항목 없음
    const m = key.match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return [];
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return [];
    return simplePayrollRelatedDeadlineIds(year, month);
  }

  if (taxType === 'vat') {
    const idx = key.indexOf('-');
    if (idx < 0) return [];
    const year = Number(key.slice(0, idx));
    const phase = key.slice(idx + 1) as VatPhase;
    if (!Number.isFinite(year) || !(VAT_PHASES as readonly string[]).includes(phase)) return [];
    const periodId = VAT_PHASE_TO_DEADLINE_ID[phase];
    if (!periodId) return [];
    return [`tax-vat-${year}-${periodId}`];
  }

  if (taxType === 'comprehensive') {
    const year = Number(key);
    if (!Number.isFinite(year) || year < 2000) return [];
    return [
      `tax-income-${year}-general`,
      `tax-income-${year}-honest`,
      `tax-local-income-${year}-general`,
      `tax-local-income-${year}-honest`,
    ];
  }

  if (taxType === 'corporate') {
    const parsed = parsePeriodKey('corporate', key);
    const year = parsed.year;
    if (!Number.isFinite(year) || year < 2000) return [];
    if (parsed.corpPhase === '중간예납') {
      return [`tax-corp-interim-${year}-12`];
    }
    return [`tax-corp-${year}-12`, `tax-corp-local-${year}-12`];
  }

  if (taxType === 'yearEnd') {
    const year = Number(key);
    if (!Number.isFinite(year) || year < 2000) return [];
    return yearEndRelatedDeadlineIds(year);
  }

  // businessStatus 등 — 회사일정 세무마감 없음
  return [];
}
