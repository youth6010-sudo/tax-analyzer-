import { HOLIDAYS } from './holidays';
import type { SkippedDay } from './types';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 로컬 시간대 기준 YYYY-MM-DD 문자열 (UTC 변환으로 인한 날짜 밀림 방지)
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekdayKo(date: Date): string {
  return WEEKDAY_KO[date.getDay()];
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 일요일 또는 토요일
}

export function getHolidayName(date: Date): string | null {
  return HOLIDAYS[toISODate(date)] || null;
}

export function isHoliday(date: Date): boolean {
  return Boolean(getHolidayName(date));
}

// 주말 또는 공휴일이면 휴일로 판단
export function isNonBusinessDay(date: Date): boolean {
  return isWeekend(date) || isHoliday(date);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// 해당 연/월의 말일 (month: 1~12)
export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

export type AdjustResult = {
  original: Date;
  adjusted: Date;
  wasAdjusted: boolean;
  skipped: SkippedDay[];
};

// 마감일이 휴일이면 다음 영업일로 이동.
// 조정 내역(건너뛴 휴일 목록)을 함께 반환합니다.
export function adjustToNextBusinessDay(date: Date): AdjustResult {
  const original = new Date(date);
  let cursor = new Date(date);
  const skipped: SkippedDay[] = [];
  let guard = 0;

  while (isNonBusinessDay(cursor)) {
    skipped.push({
      date: toISODate(cursor),
      weekday: getWeekdayKo(cursor),
      reason: isWeekend(cursor)
        ? cursor.getDay() === 6
          ? '토요일'
          : '일요일'
        : (getHolidayName(cursor) as string),
    });
    cursor = addDays(cursor, 1);
    if (++guard > 30) break; // 안전장치 (무한루프 방지)
  }

  return {
    original,
    adjusted: cursor,
    wasAdjusted: toISODate(original) !== toISODate(cursor),
    skipped,
  };
}

// "2026년 1월 26일 (월)" 형식
export function formatKoreanDate(date: Date, { withWeekday = true } = {}): string {
  const base = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  return withWeekday ? `${base} (${getWeekdayKo(date)})` : base;
}

// "2026. 05. 08 (금)" 형식 (점 표기, 0 채움)
export function formatDottedDate(date: Date, { withWeekday = true } = {}): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const base = `${y}. ${m}. ${d}`;
  return withWeekday ? `${base} (${getWeekdayKo(date)})` : base;
}
