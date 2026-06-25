import { TAX_TYPES, VAT_PERIODS, INCOME_FILING_TYPES } from './taxTypes';
import {
  adjustToNextBusinessDay,
  lastDayOfMonth,
  formatKoreanDate,
} from './dateUtils';
import type { DeadlineParams, DeadlineResult, TaxTypeKey } from './types';

// 각 세목별 "법정 마감일(보정 전)"을 계산한 뒤,
// 휴일 보정을 적용해 최종 결과 객체를 반환합니다.

function buildResult({
  periodLabel,
  coverage = '',
  statutory,
}: {
  periodLabel: string;
  coverage?: string;
  statutory: Date;
}): DeadlineResult {
  const adj = adjustToNextBusinessDay(statutory);
  return {
    periodLabel,
    coverage, // 화면 표시용 과세기간 (안내문구에는 포함하지 않음)
    statutory,
    final: adj.adjusted,
    wasAdjusted: adj.wasAdjusted,
    skipped: adj.skipped,
    statutoryText: formatKoreanDate(statutory),
    finalText: formatKoreanDate(adj.adjusted),
  };
}

// 원천세: 귀속 연월의 다음 달 10일
function calcWithholding({ year, month }: DeadlineParams): DeadlineResult {
  // 다음 달 10일 (12월 귀속 → 다음 해 1월 10일)
  const dueDate = new Date(year, month, 10); // month는 1~12, month 인덱스가 곧 "다음 달"
  return buildResult({
    periodLabel: `${year}년 ${month}월 귀속`,
    statutory: dueDate,
  });
}

// 부가가치세: 과세기간별 마감 (예: 1기 확정 → 7/25)
function calcVat({ year, vatPeriodId }: DeadlineParams): DeadlineResult {
  const period = VAT_PERIODS.find(p => p.id === vatPeriodId) || VAT_PERIODS[0];
  const dueYear = year + period.dueYearOffset;
  const dueDate = new Date(dueYear, period.dueMonth - 1, period.dueDay);
  return buildResult({
    periodLabel: `${year}년 ${period.label}`,
    coverage: `과세기간 ${period.coverage}`,
    statutory: dueDate,
  });
}

// 법인세: 사업연도 종료월 말일로부터 3개월이 되는 달의 말일
function calcCorporate({ year, fyEndMonth }: DeadlineParams): DeadlineResult {
  // 사업연도 종료 = year년 fyEndMonth월 말일
  // 신고기한 = 종료월 + 3개월이 되는 달의 말일
  let dueMonth = fyEndMonth + 3;
  let dueYear = year;
  if (dueMonth > 12) {
    dueMonth -= 12;
    dueYear += 1;
  }
  const dueDate = lastDayOfMonth(dueYear, dueMonth);
  return buildResult({
    periodLabel: `${year}년 ${fyEndMonth}월 결산 법인`,
    statutory: dueDate,
  });
}

// 종합소득세: 귀속 연도 다음 해 5/31 (성실신고대상 6/30)
function calcIncome({ year, filingTypeId }: DeadlineParams): DeadlineResult {
  const filing =
    INCOME_FILING_TYPES.find(f => f.id === filingTypeId) || INCOME_FILING_TYPES[0];
  const dueDate = new Date(year + 1, filing.dueMonth - 1, filing.dueDay);
  return buildResult({
    periodLabel: `${year}년 귀속 (${filing.label})`,
    statutory: dueDate,
  });
}

export function calculateDeadline(
  taxType: TaxTypeKey,
  params: DeadlineParams
): DeadlineResult | null {
  switch (taxType) {
    case TAX_TYPES.WITHHOLDING:
      return calcWithholding(params);
    case TAX_TYPES.VAT:
      return calcVat(params);
    case TAX_TYPES.CORPORATE:
      return calcCorporate(params);
    case TAX_TYPES.INCOME:
      return calcIncome(params);
    default:
      return null;
  }
}
