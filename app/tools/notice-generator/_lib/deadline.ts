import { TAX_TYPES, VAT_PERIODS, INCOME_FILING_TYPES } from './taxTypes';
import {
  addDays,
  adjustToNextBusinessDay,
  formatDottedDate,
  lastDayOfMonth,
  formatKoreanDate,
  toISODate,
} from './dateUtils';
import type { DeadlineParams, DeadlineResult, TaxTypeKey } from './types';

// 각 세목별 "법정 마감일(보정 전)"을 계산한 뒤,
// 휴일 보정을 적용해 최종 결과 객체를 반환합니다.

function buildResult({
  periodLabel,
  coverage = '',
  coverageStart,
  coverageEnd,
  statutory,
}: {
  periodLabel: string;
  coverage?: string;
  coverageStart: Date;
  coverageEnd: Date;
  statutory: Date;
}): DeadlineResult {
  const adj = adjustToNextBusinessDay(statutory);
  return {
    periodLabel,
    coverage, // 화면 표시용 과세기간 (안내문구에는 포함하지 않음)
    coverageStart,
    coverageEnd,
    statutory,
    final: adj.adjusted,
    wasAdjusted: adj.wasAdjusted,
    skipped: adj.skipped,
    statutoryText: formatKoreanDate(statutory),
    finalText: formatKoreanDate(adj.adjusted),
  };
}

// 원천세: 귀속 연월의 다음 달 10일 신고·납부
// 대상 기간: 전월 신고 마감일(휴일 보정 후) 다음날 ~ 해당 신고 마감일(휴일 보정 후)
// 예) 2026년 6월 지급 → 2026.06.11 ~ 2026.07.10
function calcWithholding({ year, month }: DeadlineParams): DeadlineResult {
  const statutory = new Date(year, month, 10);

  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevStatutory = new Date(prevYear, prevMonth, 10);
  const prevFinal = adjustToNextBusinessDay(prevStatutory).adjusted;
  const coverageStart = addDays(prevFinal, 1);
  const coverageEnd = adjustToNextBusinessDay(statutory).adjusted;

  return buildResult({
    periodLabel: `${year}년 ${month}월 지급`,
    coverage: `${formatDottedDate(coverageStart, { withWeekday: false })} ~ ${formatDottedDate(coverageEnd, { withWeekday: false })}`,
    coverageStart,
    coverageEnd,
    statutory,
  });
}

// 부가가치세: 과세기간별 마감 (예: 1기 확정 → 7/25)
function calcVat({ year, vatPeriodId }: DeadlineParams): DeadlineResult {
  const period = VAT_PERIODS.find(p => p.id === vatPeriodId) || VAT_PERIODS[0];
  const dueYear = year + period.dueYearOffset;
  const dueDate = new Date(dueYear, period.dueMonth - 1, period.dueDay);
  return buildResult({
    periodLabel: `${year}년 ${period.shortLabel}`,
    coverage: `과세기간 ${period.coverage}`,
    coverageStart: new Date(year, period.startMonth - 1, period.startDay),
    coverageEnd: new Date(year, period.endMonth - 1, period.endDay),
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
  // 사업연도(과세기간): 종료월 말일 기준 직전 12개월
  // 12월 결산 → 1/1~12/31, 3월 결산 → 전년 4/1~당해 3/31
  const coverageEnd = lastDayOfMonth(year, fyEndMonth);
  const coverageStart = new Date(year, fyEndMonth - 12, 1);
  return buildResult({
    periodLabel: `${year}년 ${fyEndMonth}월 결산`,
    coverageStart,
    coverageEnd,
    statutory: dueDate,
  });
}

// 종합소득세: 귀속 연도 다음 해 5/31 (성실신고대상 6/30)
function calcIncome({ year, filingTypeId }: DeadlineParams): DeadlineResult {
  const filing =
    INCOME_FILING_TYPES.find(f => f.id === filingTypeId) || INCOME_FILING_TYPES[0];
  const dueDate = new Date(year + 1, filing.dueMonth - 1, filing.dueDay);
  return buildResult({
    periodLabel:
      filingTypeId === 'general' ? `${year}년 귀속` : `${year}년 귀속 (${filing.label})`,
    coverageStart: new Date(year, 0, 1),
    coverageEnd: new Date(year, 11, 31),
    statutory: dueDate,
  });
}

// 세목별 "자료 제출 마감" 최초 기본값 (신고 기한일 기준)
//  · 원천세: 신고 마감 3일 전
//  · 부가세: 신고 마감 2주 전
//  · 종소세: 신고 마감 3주 전
//  · 법인세: 신고 마감월 직전 달 15일(= 12월 결산 기준 2월 중순)
export function defaultMaterialDate(taxType: TaxTypeKey, finalDate: Date): string {
  switch (taxType) {
    case TAX_TYPES.WITHHOLDING:
      return toISODate(addDays(finalDate, -3));
    case TAX_TYPES.VAT:
      return toISODate(addDays(finalDate, -14));
    case TAX_TYPES.INCOME:
      return toISODate(addDays(finalDate, -21));
    case TAX_TYPES.CORPORATE:
      return toISODate(new Date(finalDate.getFullYear(), finalDate.getMonth() - 1, 15));
    default:
      return toISODate(finalDate);
  }
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
