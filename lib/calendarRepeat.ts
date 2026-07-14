/** 캘린더 반복 일정 — 기간 내 요일·주기 전개 */

export const WEEKDAY_OPTIONS = [
  { id: 0, label: '일' },
  { id: 1, label: '월' },
  { id: 2, label: '화' },
  { id: 3, label: '수' },
  { id: 4, label: '목' },
  { id: 5, label: '금' },
  { id: 6, label: '토' },
] as const;

export type RepeatMode = 'weekdays' | 'interval';

export type RepeatIntervalKind = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export const INTERVAL_OPTIONS: { id: RepeatIntervalKind; label: string }[] = [
  { id: 'daily', label: '매일' },
  { id: 'weekly', label: '매주' },
  { id: 'biweekly', label: '격주 (2주)' },
  { id: 'monthly', label: '매월' },
  { id: 'custom', label: 'N일마다' },
];

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

function pushDate(dates: string[], d: Date) {
  dates.push(toIsoLocal(d));
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

function expandByInterval(
  from: Date,
  to: Date,
  interval: RepeatIntervalKind,
  everyDays?: number,
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
    const dayOfMonth = from.getDate();
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

/** 기간(from~to) 안에서 요일 또는 주기에 해당하는 날짜 목록 */
export function expandRepeatDates(input: CalendarRepeatInput): string[] {
  const from = parseIsoDate(input.from);
  const to = parseIsoDate(input.to);
  if (!from || !to) throw new Error('기간 날짜 형식이 올바르지 않습니다.');
  if (to < from) throw new Error('종료일은 시작일 이후여야 합니다.');

  const mode: RepeatMode =
    input.mode ??
    (input.interval ? 'interval' : 'weekdays');

  const dates =
    mode === 'interval'
      ? expandByInterval(from, to, input.interval ?? 'weekly', input.everyDays)
      : expandByWeekdays(from, to, input.weekdays ?? []);

  if (dates.length === 0) {
    throw new Error(
      mode === 'interval'
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

  try {
    return expandRepeatDates({
      from: input.from,
      to: input.to,
      mode,
      weekdays: input.weekdays,
      interval: input.interval,
      everyDays: input.everyDays,
    }).length;
  } catch {
    return null;
  }
}
