import type { TaxTypeId } from '@/app/config/taxTypes';

export type FilingPeriod = {
  taxType: TaxTypeId;
  periodKey: string;
  label: string;
  windowLabel: string;
};

const VAT_MONTHS = [1, 4, 7, 10];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** 현재 날짜 기준 활성 신고 체크 기간 */
export function getActiveFilingPeriods(today = new Date()): FilingPeriod[] {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const periods: FilingPeriod[] = [];

  // 원천세: 매월 1~10일
  if (d >= 1 && d <= 10) {
    periods.push({
      taxType: 'withholding',
      periodKey: `${y}-${pad2(m)}`,
      label: `${y}년 ${m}월 원천세`,
      windowLabel: `${m}월 1일 ~ 10일`,
    });
  }

  // 부가세: 1·4·7·10월 1~10일
  if (VAT_MONTHS.includes(m) && d >= 1 && d <= 10) {
    const q = VAT_MONTHS.indexOf(m) + 1;
    periods.push({
      taxType: 'vat',
      periodKey: `${y}-Q${q}-vat`,
      label: `${y}년 ${m}월 부가세 (${q}기)`,
      windowLabel: `${m}월 1일 ~ 10일`,
    });
  }

  // 법인세: 3월
  if (m === 3) {
    periods.push({
      taxType: 'corporate',
      periodKey: `${y}-corporate`,
      label: `${y}년 법인세`,
      windowLabel: '3월',
    });
  }

  // 종합소득세: 5월
  if (m === 5) {
    periods.push({
      taxType: 'comprehensive',
      periodKey: `${y}-comprehensive`,
      label: `${y}년 종합소득세`,
      windowLabel: '5월',
    });
  }

  return periods;
}

/** 대시보드 기본 선택 (첫 번째 활성 기간, 없으면 원천세 현재월) */
export function defaultFilingSelection(today = new Date()): { taxType: TaxTypeId; periodKey: string } {
  const active = getActiveFilingPeriods(today);
  if (active.length) {
    return { taxType: active[0].taxType, periodKey: active[0].periodKey };
  }
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  return { taxType: 'withholding', periodKey: `${y}-${pad2(m)}` };
}

export function filingPeriodLabel(taxType: TaxTypeId, periodKey: string): string {
  const active = getActiveFilingPeriods();
  const hit = active.find(p => p.taxType === taxType && p.periodKey === periodKey);
  if (hit) return hit.label;
  if (taxType === 'withholding') return periodKey.replace('-', '년 ') + '월 원천세';
  if (taxType === 'vat') return periodKey.replace('-Q', '년 ').replace('-vat', '기 부가세');
  if (taxType === 'corporate') return periodKey.replace('-corporate', '년 법인세');
  if (taxType === 'comprehensive') return periodKey.replace('-comprehensive', '년 종합소득세');
  return periodKey;
}
