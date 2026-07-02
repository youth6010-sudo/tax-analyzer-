'use client';

import type { ReactNode } from 'react';
import type { CalendarEventDto } from '@/app/types/calendar';
import CalendarEventChip from './CalendarEventChip';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function eventOnDate(event: CalendarEventDto, date: string): boolean {
  return date >= event.startDate && date <= event.endDate;
}

function weekdayHeaderClass(index: number): string {
  const base = 'py-2.5 text-center text-sm font-bold tracking-wide';
  if (index === 0) return `${base} text-red-600`;
  if (index === 6) return `${base} text-blue-600`;
  return `${base} text-slate-700`;
}

type DayCellProps = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEventDto[];
  onSelect: (date: string) => void;
  onEventDoubleClick?: (event: CalendarEventDto) => void;
  tall?: boolean;
  currentUser?: string;
  members?: readonly string[];
};

export function CalendarDayCell({
  date,
  day,
  inMonth,
  isToday,
  isSelected,
  events,
  onSelect,
  onEventDoubleClick,
  tall = false,
  currentUser,
  members = [],
}: DayCellProps) {
  const maxVisible = tall ? 10 : 5;
  const visible = events.slice(0, maxVisible);
  const more = events.length - visible.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      className={`relative border-b border-r border-slate-200/80 p-1.5 text-left transition-colors ${
        tall ? 'min-h-[12rem]' : 'min-h-[9.5rem]'
      } ${inMonth ? 'bg-white' : 'bg-slate-50/90'} ${
        isSelected
          ? 'bg-blue-50/60 ring-2 ring-inset ring-blue-400'
          : isToday
            ? 'bg-blue-50/30 hover:bg-blue-50/50'
            : 'hover:bg-slate-50'
      }`}
    >
      <span
        className={`absolute left-1.5 top-1.5 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold leading-none ${
          isToday
            ? 'bg-blue-600 text-white shadow-sm'
            : inMonth
              ? 'text-slate-800'
              : 'text-slate-400'
        }`}
      >
        {day}
      </span>
      <div className="mt-7 space-y-1 overflow-y-auto max-h-[calc(100%-1.75rem)] w-full">
        {visible.map(ev => (
          <CalendarEventChip
            key={ev.id}
            event={ev}
            compact
            currentUser={currentUser}
            members={members}
            onDoubleClick={onEventDoubleClick}
          />
        ))}
        {more > 0 && (
          <span className="block px-0.5 text-xs font-semibold text-slate-600">+{more}건 더보기</span>
        )}
      </div>
    </button>
  );
}

function buildMonthGrid(year: number, month: number): { date: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: { date: string; day: number; inMonth: boolean }[] = [];

  const prevMonthDays = new Date(year, month - 1, 0).getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({ date: isoDate(y, m, d), day: d, inMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: isoDate(year, month, d), day: d, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const d = cells.length - startPad - daysInMonth + 1;
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({ date: isoDate(y, m, d), day: d, inMonth: false });
  }

  return cells;
}

function buildWeekDates(year: number, month: number, anchorDate: string): string[] {
  const anchor = new Date(anchorDate + 'T00:00:00');
  const day = anchor.getDay();
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - day);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return dates;
}

function CalendarGridShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/80">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={weekdayHeaderClass(i)}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">{children}</div>
    </div>
  );
}

type Props = {
  year: number;
  month: number;
  mode: 'month' | 'week';
  events: CalendarEventDto[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onEventDoubleClick?: (event: CalendarEventDto) => void;
  currentUser?: string;
  members?: readonly string[];
};

export default function CalendarView({
  year,
  month,
  mode,
  events,
  selectedDate,
  onSelectDate,
  onEventDoubleClick,
  currentUser,
  members = [],
}: Props) {
  const today = new Date().toISOString().slice(0, 10);

  if (mode === 'week') {
    const weekDates = buildWeekDates(year, month, selectedDate || today);
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-200">
        {weekDates.map(date => {
          const d = new Date(date + 'T00:00:00');
          const weekdayIndex = d.getDay();
          const dayEvents = events.filter(ev => eventOnDate(ev, date));
          const dayNum = Number(date.slice(8, 10));
          return (
            <div
              key={date}
              className={`flex gap-4 px-4 py-3 transition-colors ${
                date === selectedDate
                  ? 'bg-blue-50/70 ring-2 ring-inset ring-blue-300'
                  : date === today
                    ? 'bg-blue-50/30'
                    : 'hover:bg-slate-50/80'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDate(date)}
                className="shrink-0 w-[5.5rem] text-left py-0.5"
              >
                <span
                  className={`block text-2xl font-bold leading-none ${
                    weekdayIndex === 0
                      ? 'text-red-600'
                      : weekdayIndex === 6
                        ? 'text-blue-600'
                        : 'text-slate-900'
                  } ${date === today ? 'underline decoration-blue-500 decoration-2 underline-offset-4' : ''}`}
                >
                  {dayNum}
                </span>
                <span
                  className={`mt-1 block text-sm font-semibold ${
                    weekdayIndex === 0
                      ? 'text-red-500'
                      : weekdayIndex === 6
                        ? 'text-blue-500'
                        : 'text-slate-600'
                  }`}
                >
                  {WEEKDAYS[weekdayIndex]}
                </span>
              </button>
              <div className="min-w-0 flex-1 border-l border-slate-100 pl-4">
                {dayEvents.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400">일정 없음</p>
                ) : (
                  <div className="space-y-1.5 py-0.5">
                    {dayEvents.map(ev => (
                      <CalendarEventChip
                        key={ev.id}
                        event={ev}
                        currentUser={currentUser}
                        members={members}
                        onDoubleClick={onEventDoubleClick}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const cells = buildMonthGrid(year, month);

  return (
    <CalendarGridShell>
      {cells.map(cell => {
        const dayEvents = events.filter(ev => eventOnDate(ev, cell.date));
        return (
          <CalendarDayCell
            key={cell.date}
            date={cell.date}
            day={cell.day}
            inMonth={cell.inMonth}
            isToday={cell.date === today}
            isSelected={cell.date === selectedDate}
            events={dayEvents}
            onSelect={onSelectDate}
            onEventDoubleClick={onEventDoubleClick}
            currentUser={currentUser}
            members={members}
          />
        );
      })}
    </CalendarGridShell>
  );
}
