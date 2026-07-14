import { calculateDeadline } from '@/app/tools/notice-generator/_lib/deadline';
import {
  adjustToNextBusinessDay,
  lastDayOfMonth,
  toISODate,
} from '@/app/tools/notice-generator/_lib/dateUtils';
import { TAX_TYPES, VAT_PERIODS, CORPORATE_FY_END_MONTHS } from '@/app/tools/notice-generator/_lib/taxTypes';
import type { CalendarEventDto, CompanyEventDto, TaxDeadlineDto } from '@/app/types/calendar';
import type { DeadlineParams } from '@/app/tools/notice-generator/_lib/types';

/** 캘린더용 부가세 — 예정·확정만 (반기/연간 중복 제외) */
const CALENDAR_VAT_PERIOD_IDS = new Set(['1-pre', '1-final', '2-pre', '2-final']);

/** taxType → 칩·목록 부제 */
export const TAX_DEADLINE_TYPE_LABELS: Record<string, string> = {
  withholding: '원천세',
  vat: '부가세',
  comprehensive: '종합소득세',
  corporate: '법인세',
  corporate_interim: '법인세 중간예납',
  property: '종부세',
  local_income: '개인지방소득세',
  corporate_local: '법인지방소득세',
  year_end: '지급명세서',
  simple_payroll: '간이지급명세서',
  labor_content: '근로내용확인신고',
  daily_payroll: '일용근로지급명세서',
};

function baseParams(overrides: Partial<DeadlineParams> & { year: number }): DeadlineParams {
  return {
    year: overrides.year,
    month: overrides.month ?? 1,
    vatPeriodId: overrides.vatPeriodId ?? '1-pre',
    fyEndMonth: overrides.fyEndMonth ?? 12,
    filingTypeId: overrides.filingTypeId ?? 'general',
  };
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/**
 * 법인세 중간예납 법정 마감일
 * — 사업연도 개시일부터 6개월이 되는 날(중간예납기간 종료일)부터 2개월이 되는 달의 말일
 */
function corporateInterimStatutory(fyEndYear: number, fyEndMonth: number): Date {
  let interimEndMonth = fyEndMonth - 6;
  let interimEndYear = fyEndYear;
  if (interimEndMonth <= 0) {
    interimEndMonth += 12;
    interimEndYear -= 1;
  }
  let dueMonth = interimEndMonth + 2;
  let dueYear = interimEndYear;
  if (dueMonth > 12) {
    dueMonth -= 12;
    dueYear += 1;
  }
  return lastDayOfMonth(dueYear, dueMonth);
}

/** 법인지방소득세 — 사업연도 종료월 말일부터 4개월이 되는 달의 말일 (= 법인세보다 1개월 뒤) */
function corporateLocalStatutory(fyEndYear: number, fyEndMonth: number): Date {
  let dueMonth = fyEndMonth + 4;
  let dueYear = fyEndYear;
  if (dueMonth > 12) {
    dueMonth -= 12;
    dueYear += 1;
  }
  return lastDayOfMonth(dueYear, dueMonth);
}

/** 지급월(year, month) → 다음 달 말일 */
function nextMonthEnd(year: number, month: number): Date {
  let y = year;
  let m = month + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return lastDayOfMonth(y, m);
}

/** 지급월(year, month) → 다음 달 15일 (근로내용확인신고) */
function nextMonthDay15(year: number, month: number): Date {
  let y = year;
  let m = month + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return new Date(y, m - 1, 15);
}

function pushDeadline(
  items: TaxDeadlineDto[],
  from: string,
  to: string,
  item: Omit<TaxDeadlineDto, 'date'> & { statutory: Date },
) {
  const date = toISODate(adjustToNextBusinessDay(item.statutory).adjusted);
  if (!inRange(date, from, to)) return;
  items.push({
    id: item.id,
    taxType: item.taxType,
    title: item.title,
    date,
    periodLabel: item.periodLabel,
  });
}

/**
 * 세무신고 법정 마감일 (국세·지방세·지급명세서 등)
 * — 휴일·공휴일이면 다음 영업일로 보정
 */
export function listTaxDeadlines(from: string, to: string): TaxDeadlineDto[] {
  const fromYear = Number(from.slice(0, 4)) - 1;
  const toYear = Number(to.slice(0, 4)) + 1;
  const items: TaxDeadlineDto[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    // 원천세 — 매월 10일 (전월 지급분)
    for (let month = 1; month <= 12; month++) {
      const wh = calculateDeadline(TAX_TYPES.WITHHOLDING, baseParams({ year, month }));
      if (wh) {
        const date = toISODate(wh.final);
        if (inRange(date, from, to)) {
          items.push({
            id: `tax-wh-${year}-${month}`,
            taxType: 'withholding',
            title: `원천세 ${wh.periodLabel}`,
            date,
            periodLabel: wh.periodLabel,
          });
        }
      }
    }

    // 간이지급명세서 — 지급일이 속하는 달의 다음 달 말일 (매월)
    for (let month = 1; month <= 12; month++) {
      pushDeadline(items, from, to, {
        id: `tax-sp-m-${year}-${month}`,
        taxType: 'simple_payroll',
        title: `간이지급명세서 ${year}년 ${month}월분`,
        periodLabel: `${year}년 ${month}월 지급`,
        statutory: nextMonthEnd(year, month),
      });
    }

    // 일용근로소득 지급명세서 — 지급월의 다음 달 말일 (매월)
    for (let month = 1; month <= 12; month++) {
      pushDeadline(items, from, to, {
        id: `tax-daily-${year}-${month}`,
        taxType: 'daily_payroll',
        title: `일용근로지급명세서 ${year}년 ${month}월분`,
        periodLabel: `${year}년 ${month}월 지급`,
        statutory: nextMonthEnd(year, month),
      });
    }

    // 근로내용확인신고 — 전월분 · 익월 15일 (근로복지공단)
    for (let month = 1; month <= 12; month++) {
      pushDeadline(items, from, to, {
        id: `tax-labor-${year}-${month}`,
        taxType: 'labor_content',
        title: `근로내용확인신고 ${year}년 ${month}월분`,
        periodLabel: `${year}년 ${month}월 근로`,
        statutory: nextMonthDay15(year, month),
      });
    }

    // 부가세 — 1·2기 예정/확정
    for (const period of VAT_PERIODS) {
      if (!CALENDAR_VAT_PERIOD_IDS.has(period.id)) continue;
      const vat = calculateDeadline(TAX_TYPES.VAT, baseParams({ year, vatPeriodId: period.id }));
      if (!vat) continue;
      const date = toISODate(vat.final);
      if (!inRange(date, from, to)) continue;
      items.push({
        id: `tax-vat-${year}-${period.id}`,
        taxType: 'vat',
        title: `부가세 ${vat.periodLabel}`,
        date,
        periodLabel: vat.periodLabel,
      });
    }

    // 종합소득세 (일반 5/31 · 성실신고 6/30) — year = 귀속연도
    for (const filingTypeId of ['general', 'honest'] as const) {
      const income = calculateDeadline(
        TAX_TYPES.INCOME,
        baseParams({ year, filingTypeId }),
      );
      if (!income) continue;
      const date = toISODate(income.final);
      if (!inRange(date, from, to)) continue;
      items.push({
        id: `tax-income-${year}-${filingTypeId}`,
        taxType: 'comprehensive',
        title: `종합소득세 ${income.periodLabel}`,
        date,
        periodLabel: income.periodLabel,
      });
    }

    // 개인지방소득세 — 종소세와 동일 기한
    pushDeadline(items, from, to, {
      id: `tax-local-income-${year}-general`,
      taxType: 'local_income',
      title: `개인지방소득세 ${year}년 귀속 (일반)`,
      periodLabel: `${year}년 귀속 · 일반`,
      statutory: new Date(year + 1, 4, 31), // 5/31
    });
    pushDeadline(items, from, to, {
      id: `tax-local-income-${year}-honest`,
      taxType: 'local_income',
      title: `개인지방소득세 ${year}년 귀속 (성실신고)`,
      periodLabel: `${year}년 귀속 · 성실신고`,
      statutory: new Date(year + 1, 5, 30), // 6/30
    });

    // 법인세 — 결산월별 (종료월+3개월 말일)
    for (const fy of CORPORATE_FY_END_MONTHS) {
      const corp = calculateDeadline(
        TAX_TYPES.CORPORATE,
        baseParams({ year, fyEndMonth: fy.id }),
      );
      if (!corp) continue;
      const date = toISODate(corp.final);
      if (inRange(date, from, to)) {
        items.push({
          id: `tax-corp-${year}-${fy.id}`,
          taxType: 'corporate',
          title: `법인세 ${corp.periodLabel}`,
          date,
          periodLabel: corp.periodLabel,
        });
      }

      // 법인지방소득세 — 법인세보다 1개월 뒤 (종료월+4개월 말일)
      pushDeadline(items, from, to, {
        id: `tax-corp-local-${year}-${fy.id}`,
        taxType: 'corporate_local',
        title: `법인지방소득세 ${year}년 ${fy.id}월 결산`,
        periodLabel: `${year}년 ${fy.id}월 결산`,
        statutory: corporateLocalStatutory(year, fy.id),
      });
    }

    // 법인세 중간예납 — 결산월별
    for (const fy of CORPORATE_FY_END_MONTHS) {
      const periodLabel = `${year}년 ${fy.id}월 결산`;
      pushDeadline(items, from, to, {
        id: `tax-corp-interim-${year}-${fy.id}`,
        taxType: 'corporate_interim',
        title: `법인세 중간예납 ${periodLabel}`,
        periodLabel,
        statutory: corporateInterimStatutory(year, fy.id),
      });
    }

    // 종부세 — 12/15
    pushDeadline(items, from, to, {
      id: `tax-property-${year}`,
      taxType: 'property',
      title: `종부세 ${year}년`,
      periodLabel: `${year}년 과세`,
      statutory: new Date(year, 11, 15), // 12/15
    });

    // 지급명세서 — 소득 종류별 제출시기 (귀속 year)
    // 근로·퇴직·사업: 익년 3/10
    for (const kind of [
      { id: 'employed', label: '근로소득' },
      { id: 'retirement', label: '퇴직소득' },
      { id: 'biz', label: '사업소득' },
    ] as const) {
      pushDeadline(items, from, to, {
        id: `tax-paystmt-${kind.id}-${year}`,
        taxType: 'year_end',
        title: `지급명세서(${kind.label}) ${year}년 귀속`,
        periodLabel: `${year}년 귀속 · ${kind.label}`,
        statutory: new Date(year + 1, 2, 10), // 3/10
      });
    }
    // 이자·배당·기타: 익년 2월 말
    for (const kind of [
      { id: 'interest-div', label: '이자배당' },
      { id: 'other', label: '기타소득' },
    ] as const) {
      pushDeadline(items, from, to, {
        id: `tax-paystmt-${kind.id}-${year}`,
        taxType: 'year_end',
        title: `지급명세서(${kind.label}) ${year}년 귀속`,
        periodLabel: `${year}년 귀속 · ${kind.label}`,
        statutory: lastDayOfMonth(year + 1, 2), // 2월 말
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
}

export function listUpcomingTaxDeadlines(limit = 10): TaxDeadlineDto[] {
  const today = new Date();
  const from = toISODate(today);
  const end = new Date(today);
  end.setMonth(end.getMonth() + 3);
  const to = toISODate(end);
  return listTaxDeadlines(from, to).slice(0, limit);
}

export function taxDeadlinesToCalendarEvents(deadlines: TaxDeadlineDto[]): CalendarEventDto[] {
  return deadlines.map(d => ({
    id: d.id,
    kind: 'tax_deadline' as const,
    title: d.title,
    startDate: d.date,
    endDate: d.date,
    allDay: true,
    subtitle: TAX_DEADLINE_TYPE_LABELS[d.taxType] ?? '세무신고',
  }));
}

/** 홈·회사일정 목록용 — 세무신고 마감을 CompanyEventDto 형태로 */
export function taxDeadlinesToCompanyEvents(deadlines: TaxDeadlineDto[]): CompanyEventDto[] {
  return deadlines.map(d => ({
    id: d.id,
    title: d.title,
    description: TAX_DEADLINE_TYPE_LABELS[d.taxType] ?? '세무신고일정',
    startDate: d.date,
    endDate: d.date,
    scheduleKind: 'deadline' as const,
    allDay: true,
    createdBy: 'system',
    createdAt: '',
    updatedAt: '',
    source: 'tax_deadline' as const,
  }));
}
