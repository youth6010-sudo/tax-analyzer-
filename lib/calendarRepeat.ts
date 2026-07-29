/** 캘린더 반복 일정 — 기간 내 요일·주기·세목 마감일 전개 */

import { listTaxDeadlines } from '@/lib/taxDeadlineCalendar';

export const WEEKDAY_OPTIONS = [
  { id: 0, label: '일' },
  { id: 1, label: '월' },
  { id: 2, label: '화' },
  { id: 3, label: '수' },
  { id: 4, label: '목' },
  { id: 5, label: '금' },
  { id: 6, label: '토' },
] as const;

export type RepeatMode = 'weekdays' | 'interval' | 'taxDeadline';

export type RepeatIntervalKind = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export type RepeatTaxDeadlineType = 'withholding' | 'vat' | 'comprehensive' | 'corporate';

export const INTERVAL_OPTIONS: { id: RepeatIntervalKind; label: string }[] = [
  { id: 'daily', label: '매일' },
  { id: 'weekly', label: '매주' },
  { id: 'biweekly', label: '격주 (2주)' },
  { id: 'monthly', label: '매월' },
  { id: 'custom', label: 'N일마다' },
];

export const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

export const TAX_DEADLINE_REPEAT_TYPES: RepeatTaxDeadlineType[] = [
  'withholding',
  'vat',
  'comprehensive',
  'corporate',
];

export function isTaxDeadlineRepeatType(value: string | null | undefined): value is RepeatTaxDeadlineType {
  return TAX_DEADLINE_REPEAT_TYPES.includes(value as RepeatTaxDeadlineType);
}

export const TAX_DEADLINE_REPEAT_HINTS: Record<RepeatTaxDeadlineType, string> = {
  withholding: '기간 내 원천세 신고 마감일(매월, 휴일이면 다음 영업일)',
  vat: '기간 내 부가세 예정·확정 마감일',
  comprehensive: '기간 내 종합소득세 신고 마감일(일반·성실신고)',
  corporate: '기간 내 법인세 마감일(12월 결산 기준)',
};

export type CalendarRepeatInput = {
  from: string;
  to: string;
  /** 기본 weekdays — 하위 호환 */
  mode?: RepeatMode;
  /** Date.getDay() — 0=일 … 6=토 (mode=weekdays) */
  weekdays?: number[];
  /** mode=interval */
  interval?: RepeatIntervalKind;
  /** interval=custom 일 때 1~90 */
  everyDays?: number;
  /** interval=monthly 일 때 1~31 (없으면 시작일 일자) */
  monthDay?: number;
  /** mode=taxDeadline */
  taxType?: RepeatTaxDeadlineType;
};

const MAX_REPEAT_DATES = 120;

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pushDate(dates: string[], d: Date | string) {
  const iso = typeof d === 'string' ? d : toIsoLocal(d);
  dates.push(iso);
  if (dates.length > MAX_REPEAT_DATES) {
    throw new Error(`반복 일정은 최대 ${MAX_REPEAT_DATES}건까지 등록할 수 있습니다.`);
  }
}

function expandByWeekdays(from: Date, to: Date, weekdays: number[]): string[] {
  const weekdaySet = new Set(
    weekdays.filter(w => Number.isInteger(w) && w >= 0 && w <= 6),
  );
  if (weekdaySet.size === 0) throw new Error('반복할 요일을 선택하세요.');

  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    if (weekdaySet.has(cursor.getDay())) pushDate(dates, cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function normalizeMonthDay(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (Number.isFinite(n) && n >= 1 && n <= 31) return n;
  if (Number.isFinite(fallback) && fallback >= 1 && fallback <= 31) return fallback;
  return 1;
}

function expandByInterval(
  from: Date,
  to: Date,
  interval: RepeatIntervalKind,
  everyDays?: number,
  monthDay?: number,
): string[] {
  const dates: string[] = [];

  if (interval === 'daily') {
    const cursor = new Date(from);
    while (cursor <= to) {
      pushDate(dates, cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (interval === 'weekly' || interval === 'biweekly') {
    const step = interval === 'weekly' ? 7 : 14;
    const cursor = new Date(from);
    while (cursor <= to) {
      pushDate(dates, cursor);
      cursor.setDate(cursor.getDate() + step);
    }
    return dates;
  }

  if (interval === 'monthly') {
    const dayOfMonth = normalizeMonthDay(monthDay, from.getDate());
    let y = from.getFullYear();
    let m = from.getMonth();
    while (true) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const d = new Date(y, m, Math.min(dayOfMonth, lastDay));
      if (d > to) break;
      if (d >= from) pushDate(dates, d);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return dates;
  }

  // custom N일마다
  const n = Math.floor(Number(everyDays));
  if (!Number.isFinite(n) || n < 1 || n > 90) {
    throw new Error('반복 주기(일)는 1~90 사이로 입력하세요.');
  }
  const cursor = new Date(from);
  while (cursor <= to) {
    pushDate(dates, cursor);
    cursor.setDate(cursor.getDate() + n);
  }
  return dates;
}

function expandByTaxDeadline(
  fromIso: string,
  toIso: string,
  taxType: RepeatTaxDeadlineType,
): string[] {
  const deadlines = listTaxDeadlines(fromIso, toIso).filter(d => {
    if (d.taxType !== taxType) return false;
    // 법인세: 12월 결산만 (건수 폭주 방지)
    if (taxType === 'corporate') {
      return d.id.includes('-12') || /12월\s*결산/.test(d.periodLabel || d.title || '');
    }
    return true;
  });

  const dates: string[] = [];
  const seen = new Set<string>();
  for (const item of deadlines) {
    const date = item.date?.trim();
    if (!date || seen.has(date)) continue;
    if (date < fromIso || date > toIso) continue;
    seen.add(date);
    pushDate(dates, date);
  }
  dates.sort();
  return dates;
}

/** 기간(from~to) 안에서 요일·주기·세목 마감일에 해당하는 날짜 목록 */
export function expandRepeatDates(input: CalendarRepeatInput): string[] {
  const from = parseIsoDate(input.from);
  const to = parseIsoDate(input.to);
  if (!from || !to) throw new Error('기간 날짜 형식이 올바르지 않습니다.');
  if (to < from) throw new Error('종료일은 시작일 이후여야 합니다.');

  const mode: RepeatMode =
    input.mode ??
    (input.interval ? 'interval' : 'weekdays');

  let dates: string[];
  if (mode === 'taxDeadline') {
    if (!input.taxType || !isTaxDeadlineRepeatType(input.taxType)) {
      throw new Error('세목 마감일을 적용할 구분을 선택하세요.');
    }
    dates = expandByTaxDeadline(input.from.trim(), input.to.trim(), input.taxType);
  } else if (mode === 'interval') {
    dates = expandByInterval(
      from,
      to,
      input.interval ?? 'weekly',
      input.everyDays,
      input.monthDay,
    );
  } else {
    dates = expandByWeekdays(from, to, input.weekdays ?? []);
  }

  if (dates.length === 0) {
    throw new Error(
      mode === 'taxDeadline'
        ? '선택한 세목 마감일이 기간 안에 없습니다.'
        : mode === 'interval'
          ? '선택한 주기에 해당하는 날짜가 기간 안에 없습니다.'
          : '선택한 요일에 해당하는 날짜가 기간 안에 없습니다.',
    );
  }
  return dates;
}

export function previewRepeatCount(input: Partial<CalendarRepeatInput>): number | null {
  if (!input.from || !input.to) return null;
  const mode =
    input.mode ??
    (input.interval ? 'interval' : input.weekdays?.length ? 'weekdays' : null);
  if (!mode) return null;
  if (mode === 'weekdays' && !input.weekdays?.length) return null;
  if (mode === 'interval' && !input.interval) return null;
  if (mode === 'interval' && input.interval === 'custom' && !input.everyDays) return null;
  if (mode === 'interval' && input.interval === 'monthly') {
    const day = Number(input.monthDay);
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  }
  if (mode === 'taxDeadline' && (!input.taxType || !isTaxDeadlineRepeatType(input.taxType))) {
    return null;
  }

  try {
    return expandRepeatDates({
      from: input.from,
      to: input.to,
      mode,
      weekdays: input.weekdays,
      interval: input.interval,
      everyDays: input.everyDays,
      monthDay: input.monthDay,
      taxType: input.taxType,
    }).length;
  } catch {
    return null;
  }
}
