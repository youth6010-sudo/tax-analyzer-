'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { portalMain } from '@/app/components/portal/uiClasses';
import CalendarToolbar, { type CalendarViewMode } from '@/app/components/calendar/CalendarToolbar';
import CalendarView from '@/app/components/calendar/CalendarView';
import CalendarTeamFilter from '@/app/components/calendar/CalendarTeamFilter';
import { eventDisplayTitle } from '@/app/components/calendar/CalendarEventChip';
import type { CalendarEventDto } from '@/app/types/calendar';
import { buildCalendarLegend, formatCalendarDateLabel, resolveEventChipColor } from '@/lib/calendarManagerColors';

const TEAM_FILTER_KEY = 'calendarTeamFilter.v1';

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function weekRange(anchor: string): { from: string; to: string } {
  const d = new Date(anchor + 'T00:00:00');
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { from: fmt(start), to: fmt(end) };
}

function readStoredTeam(currentUser: string): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TEAM_FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* ignore */ }
  return [currentUser];
}

export default function CalendarPageClient() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get('highlight');

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [mode, setMode] = useState<CalendarViewMode>('month');
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10));
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState('');
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);

  const range = useMemo(
    () => (mode === 'month' ? monthRange(year, month) : weekRange(selectedDate)),
    [mode, year, month, selectedDate],
  );

  useEffect(() => {
    void fetch('/api/calendar/team')
      .then(r => r.json())
      .then(data => {
        const team = (data as { members?: string[]; currentUser?: string }).members || [];
        const me = (data as { currentUser?: string }).currentUser || '';
        setMembers(team);
        setCurrentUser(me);
        const stored = readStoredTeam(me);
        const valid = (stored || [me]).filter(n => team.includes(n));
        setSelectedOwners(valid.length > 0 ? valid : [me]);
      })
      .catch(() => { /* ignore */ });
  }, []);

  const handleOwnersChange = (names: string[]) => {
    setSelectedOwners(names);
    try {
      localStorage.setItem(TEAM_FILTER_KEY, JSON.stringify(names));
    } catch { /* ignore */ }
  };

  const loadEvents = useCallback(async () => {
    if (selectedOwners.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const owners = encodeURIComponent(selectedOwners.join(','));
      const res = await fetch(
        `/api/calendar/events?from=${range.from}&to=${range.to}&owners=${owners}`,
      );
      const data = await res.json();
      if (res.ok) setEvents((data as { items: CalendarEventDto[] }).items || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [range.from, range.to, selectedOwners]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const goPrev = () => {
    if (mode === 'week') {
      const d = new Date(selectedDate + 'T00:00:00');
      d.setDate(d.getDate() - 7);
      setSelectedDate(d.toISOString().slice(0, 10));
      setYear(d.getFullYear());
      setMonth(d.getMonth() + 1);
      return;
    }
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };

  const goNext = () => {
    if (mode === 'week') {
      const d = new Date(selectedDate + 'T00:00:00');
      d.setDate(d.getDate() + 7);
      setSelectedDate(d.toISOString().slice(0, 10));
      setYear(d.getFullYear());
      setMonth(d.getMonth() + 1);
      return;
    }
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDate(now.toISOString().slice(0, 10));
  };

  const dayEvents = events.filter(
    ev => selectedDate >= ev.startDate && selectedDate <= ev.endDate,
  );

  const legend = useMemo(
    () => buildCalendarLegend(members, selectedOwners),
    [members, selectedOwners],
  );

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full py-4`}>
        <CalendarToolbar
          year={year}
          month={month}
          mode={mode}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onModeChange={setMode}
        />

        {members.length > 0 && currentUser && (
          <CalendarTeamFilter
            members={members}
            currentUser={currentUser}
            selected={selectedOwners}
            onChange={handleOwnersChange}
          />
        )}

        <div className="flex flex-wrap gap-2 mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          {legend.map(item => (
            <span
              key={item.key}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium text-slate-700 shadow-sm"
            >
              <span className={`h-3 w-3 rounded-full ring-1 ring-black/10 ${item.color}`} />
              {item.label}
            </span>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-12 text-center">캘린더 불러오는 중…</p>
        ) : (
          <CalendarView
            year={year}
            month={month}
            mode={mode}
            events={events}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            currentUser={currentUser}
            members={members}
          />
        )}

        {selectedDate && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              {formatCalendarDateLabel(selectedDate)} 일정
            </h2>
            {dayEvents.length === 0 ? (
              <p className="text-sm text-slate-500">일정 없음</p>
            ) : (
              <ul className="space-y-2.5">
                {dayEvents.map(ev => {
                  const color = resolveEventChipColor(ev, members);
                  const title = eventDisplayTitle(ev, currentUser);
                  const highlighted = highlight && ev.id.includes(highlight);
                  return (
                    <li
                      key={ev.id}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                        highlighted
                          ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200'
                          : 'border-slate-100 bg-slate-50/60'
                      }`}
                    >
                      <span
                        className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 ${color}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {ev.href ? (
                            <a
                              href={ev.href}
                              className="text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                            >
                              {title}
                            </a>
                          ) : (
                            <p className="text-sm font-semibold text-slate-900">{title}</p>
                          )}
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {ev.kind === 'company' ? '사내' : '개인'}
                          </span>
                        </div>
                        {ev.subtitle && (
                          <p className="mt-1 text-sm text-slate-600 leading-relaxed">{ev.subtitle}</p>
                        )}
                        {ev.kind === 'personal' && ev.ownerName && (
                          <p className="mt-0.5 text-xs text-slate-500">담당: {ev.ownerName}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </PortalPageShell>
  );
}
