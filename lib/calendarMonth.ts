import { HOLIDAYS } from '@/app/tools/notice-generator/_lib/holidays';

export type CalendarDateKind = 'holiday' | 'sunday' | 'saturday' | 'weekday';

export function krHolidayName(isoDate: string): string | undefined {
  return HOLIDAYS[isoDate];
}

export function calendarDateKind(isoDate: string): CalendarDateKind {
  if (HOLIDAYS[isoDate]) return 'holiday';
  const day = new Date(`${isoDate}T00:00:00`).getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

/** YYYY-MM-DD — 달력·대시보드용 이번 달 범위 */
export function currentMonthRange(now = new Date()): { from: string; to: string; year: number; month: number } {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, year, month };
}

export function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}
