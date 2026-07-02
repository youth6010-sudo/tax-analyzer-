import { calculateDeadline } from '@/app/tools/notice-generator/_lib/deadline';
import { toISODate } from '@/app/tools/notice-generator/_lib/dateUtils';
import { TAX_TYPES, VAT_PERIODS, CORPORATE_FY_END_MONTHS } from '@/app/tools/notice-generator/_lib/taxTypes';
import { TAX_TYPE_META } from '@/app/tools/notice-generator/_lib/taxTypes';
import type { CalendarEventDto, TaxDeadlineDto } from '@/app/types/calendar';

import type { DeadlineParams } from '@/app/tools/notice-generator/_lib/types';

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

export function listTaxDeadlines(from: string, to: string): TaxDeadlineDto[] {
  const fromYear = Number(from.slice(0, 4)) - 1;
  const toYear = Number(to.slice(0, 4)) + 1;
  const items: TaxDeadlineDto[] = [];

  for (let year = fromYear; year <= toYear; year++) {
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

    for (const period of VAT_PERIODS) {
      const vat = calculateDeadline(TAX_TYPES.VAT, baseParams({ year, vatPeriodId: period.id }));
      if (vat) {
        const date = toISODate(vat.final);
        if (inRange(date, from, to)) {
          items.push({
            id: `tax-vat-${year}-${period.id}`,
            taxType: 'vat',
            title: `부가세 ${vat.periodLabel}`,
            date,
            periodLabel: vat.periodLabel,
          });
        }
      }
    }

    const income = calculateDeadline(TAX_TYPES.INCOME, baseParams({ year, filingTypeId: 'general' }));
    if (income) {
      const date = toISODate(income.final);
      if (inRange(date, from, to)) {
        items.push({
          id: `tax-income-${year}`,
          taxType: 'comprehensive',
          title: `종합소득세 ${income.periodLabel}`,
          date,
          periodLabel: income.periodLabel,
        });
      }
    }

    for (const fy of CORPORATE_FY_END_MONTHS) {
      const corp = calculateDeadline(TAX_TYPES.CORPORATE, baseParams({ year, fyEndMonth: fy.id }));
      if (corp) {
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
      }
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
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
  return deadlines.map(d => {
    const metaKey = d.taxType === 'comprehensive' ? 'income' : d.taxType;
    const meta = TAX_TYPE_META[metaKey as keyof typeof TAX_TYPE_META];
    return {
      id: d.id,
      kind: 'tax_deadline' as const,
      title: d.title,
      startDate: d.date,
      endDate: d.date,
      allDay: true,
      subtitle: meta?.name,
    };
  });
}
