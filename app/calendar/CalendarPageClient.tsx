'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { portalMain } from '@/app/components/portal/uiClasses';
import CalendarToolbar, { type CalendarViewMode } from '@/app/components/calendar/CalendarToolbar';
import CalendarView from '@/app/components/calendar/CalendarView';
import CalendarEventChip from '@/app/components/calendar/CalendarEventChip';
import CalendarTeamFilter from '@/app/components/calendar/CalendarTeamFilter';
import type { CalendarEventDto } from '@/app/types/calendar';
import { buildCalendarLegend } from '@/lib/calendarManagerColors';

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

        <div className="flex flex-wrap gap-3 mb-3">
          {legend.map(item => (
            <span key={item.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
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
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-2">
              {selectedDate} 일정
            </h2>
            {dayEvents.length === 0 ? (
              <p className="text-xs text-slate-500">일정 없음</p>
            ) : (
              <ul className="space-y-2">
                {dayEvents.map(ev => (
                  <li
                    key={ev.id}
                    className={`flex items-center gap-2 ${
                      highlight && ev.id.includes(highlight) ? 'ring-2 ring-amber-300 rounded-lg p-1' : ''
                    }`}
                  >
                    <CalendarEventChip event={ev} currentUser={currentUser} members={members} />
                    {ev.subtitle && (
                      <span className="text-xs text-slate-500">{ev.subtitle}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </PortalPageShell>
  );
}
