import type { FilingTaxId } from '@/app/utils/filingCheck';
import { VAT_PHASES, type VatPhase } from '@/app/utils/filingCheck';

/** 부가세 신고대상확인 기수 → 회사일정 tax-vat id */
const VAT_PHASE_TO_DEADLINE_ID: Record<VatPhase, string> = {
  '1기 예정': '1-pre',
  '1기 확정': '1-final',
  '2기 예정': '2-pre',
  '2기 확정': '2-final',
};

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
    return [`tax-sp-m-${year}-${month}`];
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
    const year = Number(key);
    if (!Number.isFinite(year) || year < 2000) return [];
    // 일반적 12월 결산 법인 마감
    return [`tax-corp-${year}-12`, `tax-corp-local-${year}-12`];
  }

  if (taxType === 'yearEnd') {
    const year = Number(key);
    if (!Number.isFinite(year) || year < 2000) return [];
    return [
      `tax-paystmt-employed-${year}`,
      `tax-paystmt-retirement-${year}`,
      `tax-paystmt-biz-${year}`,
      `tax-paystmt-interest-div-${year}`,
      `tax-paystmt-other-${year}`,
    ];
  }

  // businessStatus 등 — 회사일정 세무마감 없음
  return [];
}
