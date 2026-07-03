'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { portalMain } from '@/app/components/portal/uiClasses';
import CalendarToolbar, { type CalendarViewMode } from '@/app/components/calendar/CalendarToolbar';
import CalendarView from '@/app/components/calendar/CalendarView';
import CalendarTeamFilter from '@/app/components/calendar/CalendarTeamFilter';
import { eventDisplayTitle } from '@/app/components/calendar/CalendarEventChip';
import type { CalendarEventDto, CompanyEventDto, PersonalChecklistDto } from '@/app/types/calendar';
import { formatCalendarCreatedAt } from '@/app/types/calendar';
import { formatCalendarDateLabel, resolveEventChipColor } from '@/lib/calendarManagerColors';
import {
  canDeleteCalendarEvent,
  companyEventFromCalendar,
  deleteCalendarEvent,
} from '@/lib/calendarEventClient';
import CenterModal from '@/app/components/portal/CenterModal';
import PersonalChecklistAddForm from '@/app/components/calendar/PersonalChecklistAddForm';
import CompanyEventAddForm from '@/app/components/calendar/CompanyEventAddForm';

const TEAM_FILTER_KEY = 'calendarTeamFilter.v1';
const SHOW_COMPANY_KEY = 'calendarShowCompany.v1';

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

function expandRangeToIncludeDate(
  range: { from: string; to: string },
  date: string,
): { from: string; to: string } {
  return {
    from: range.from < date ? range.from : date,
    to: range.to > date ? range.to : date,
  };
}

function readStoredShowCompany(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(SHOW_COMPANY_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch { /* ignore */ }
  return true;
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

function personalChecklistId(event: CalendarEventDto): string | null {
  if (event.kind !== 'personal' || !event.id.startsWith('personal-')) return null;
  return event.id.slice('personal-'.length);
}

export default function CalendarPageClient() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get('highlight');

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [mode, setMode] = useState<CalendarViewMode>('month');
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState('');
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [showCompany, setShowCompany] = useState(true);
  const [editItem, setEditItem] = useState<PersonalChecklistDto | null>(null);
  const [editCompany, setEditCompany] = useState<CompanyEventDto | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDto | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const range = useMemo(
    () => (mode === 'month' ? monthRange(year, month) : weekRange(selectedDate)),
    [mode, year, month, selectedDate],
  );

  const fetchRange = useMemo(
    () => expandRangeToIncludeDate(range, todayIso),
    [range, todayIso],
  );

  useEffect(() => {
    void fetch('/api/calendar/team')
      .then(r => r.json())
      .then(data => {
        const team = (data as { members?: string[]; currentUser?: string }).members || [];
        const me = (data as { currentUser?: string }).currentUser || '';
        setMembers(team);
        setCurrentUser(me);
        setShowCompany(readStoredShowCompany());
        const stored = readStoredTeam(me);
        const valid = (stored || [me]).filter(n => team.includes(n));
        setSelectedOwners(valid.length > 0 ? valid : [me]);
      })
      .catch(() => { /* ignore */ });
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setIsAdmin(!!(d as { isDeveloper?: boolean })?.isDeveloper))
      .catch(() => { /* ignore */ });
  }, []);

  const handleShowCompanyChange = (show: boolean) => {
    setShowCompany(show);
    try {
      localStorage.setItem(SHOW_COMPANY_KEY, show ? '1' : '0');
    } catch { /* ignore */ }
  };

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
        `/api/calendar/events?from=${fetchRange.from}&to=${fetchRange.to}&owners=${owners}`,
      );
      const data = await res.json();
      if (res.ok) setEvents((data as { items: CalendarEventDto[] }).items || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [fetchRange.from, fetchRange.to, selectedOwners]);

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

  const visibleEvents = useMemo(
    () => events.filter(ev => ev.kind !== 'company' || showCompany),
    [events, showCompany],
  );

  const scheduleEvents = useMemo(
    () =>
      visibleEvents.filter(ev => selectedDate >= ev.startDate && selectedDate <= ev.endDate),
    [visibleEvents, selectedDate],
  );

  const scheduleTitle =
    selectedDate === todayIso
      ? `오늘의 일정 — ${formatCalendarDateLabel(todayIso)}`
      : `${formatCalendarDateLabel(selectedDate)} 일정`;

  const openChecklistEdit = useCallback(async (event: CalendarEventDto) => {
    const id = personalChecklistId(event);
    if (!id) return;
    try {
      const res = await fetch(`/api/calendar/personal-checklist/${id}`);
      const data = await res.json();
      if (!res.ok) return;
      setEditItem((data as { item: PersonalChecklistDto }).item);
    } catch { /* ignore */ }
  }, []);

  const openCompanyEdit = useCallback((event: CalendarEventDto) => {
    const item = companyEventFromCalendar(event);
    if (item) setEditCompany(item);
  }, []);

  const handleDeleteSelected = async () => {
    if (!selectedEvent) return;
    const title = eventDisplayTitle(selectedEvent, currentUser);
    if (!confirm(`"${title}" 일정을 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await deleteCalendarEvent(selectedEvent);
      setSelectedEvent(null);
      void loadEvents();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const renderEventList = (list: CalendarEventDto[], emptyText: string) => {
    if (list.length === 0) {
      return <p className="text-sm text-slate-500">{emptyText}</p>;
    }
    return (
      <ul className="space-y-2">
        {list.map(ev => {
          const color = resolveEventChipColor(ev, members);
          const title = eventDisplayTitle(ev, currentUser);
          const isSelected = selectedEvent?.id === ev.id;
          const highlighted = highlight && ev.id.includes(highlight);
          return (
            <li
              key={ev.id}
              onClick={() => setSelectedEvent(ev)}
              onDoubleClick={e => {
                e.stopPropagation();
                if (ev.kind === 'personal') void openChecklistEdit(ev);
                else if (ev.kind === 'company') openCompanyEdit(ev);
              }}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                isSelected
                  ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                  : highlighted
                    ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200'
                    : 'border-slate-100 bg-slate-50/60 hover:border-slate-300'
              }`}
              title="클릭하여 선택 · 더블클릭하여 수정"
            >
              <span
                className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 ${color}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
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
                {ev.createdAt && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    등록 {formatCalendarCreatedAt(ev.createdAt)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

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
            showCompany={showCompany}
            onShowCompanyChange={handleShowCompanyChange}
          />
        )}

        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-3">{scheduleTitle}</h2>
          {loading ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : (
            renderEventList(
              scheduleEvents,
              selectedDate === todayIso ? '오늘 일정 없음' : '일정 없음',
            )
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-12 text-center">캘린더 불러오는 중…</p>
        ) : (
          <CalendarView
            year={year}
            month={month}
            mode={mode}
            events={visibleEvents}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onEventDoubleClick={ev => void openChecklistEdit(ev)}
            currentUser={currentUser}
            members={members}
          />
        )}

        {selectedEvent && (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 mb-1">선택한 일정</p>
                <p className="text-base font-bold text-slate-900">
                  {eventDisplayTitle(selectedEvent, currentUser)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedEvent.kind === 'company' ? '사내 일정' : '개인 체크리스트'}
                  {selectedEvent.subtitle ? ` · ${selectedEvent.subtitle}` : ''}
                </p>
                {selectedEvent.createdAt && (
                  <p className="mt-1 text-xs text-slate-400">
                    등록 {formatCalendarCreatedAt(selectedEvent.createdAt)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.kind === 'personal' && selectedEvent.ownerName === currentUser && (
                  <button
                    type="button"
                    onClick={() => void openChecklistEdit(selectedEvent)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    수정
                  </button>
                )}
                {selectedEvent.kind === 'company' && canDeleteCalendarEvent(selectedEvent, currentUser, isAdmin) && (
                  <button
                    type="button"
                    onClick={() => openCompanyEdit(selectedEvent)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    수정
                  </button>
                )}
                {canDeleteCalendarEvent(selectedEvent, currentUser, isAdmin) && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteSelected()}
                    disabled={deleting}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting ? '삭제 중…' : '삭제'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <CenterModal
        open={editItem !== null}
        title="개인 체크리스트 수정"
        description="내용을 수정한 뒤 저장하세요."
        onClose={() => setEditItem(null)}
      >
        {editItem && (
          <PersonalChecklistAddForm
            inModal
            editItem={editItem}
            onUpdated={() => {
              setEditItem(null);
              void loadEvents();
            }}
            onDeleted={() => {
              setEditItem(null);
              setSelectedEvent(null);
              void loadEvents();
            }}
            onCancel={() => setEditItem(null)}
          />
        )}
      </CenterModal>

      <CenterModal
        open={editCompany !== null}
        title="회사 일정 수정"
        description="내용을 수정하거나 삭제할 수 있습니다."
        onClose={() => setEditCompany(null)}
      >
        {editCompany && (
          <CompanyEventAddForm
            inModal
            editItem={editCompany}
            onUpdated={() => {
              setEditCompany(null);
              setSelectedEvent(null);
              void loadEvents();
            }}
            onDeleted={() => {
              setEditCompany(null);
              setSelectedEvent(null);
              void loadEvents();
            }}
            onCancel={() => setEditCompany(null)}
          />
        )}
      </CenterModal>
    </PortalPageShell>
  );
}
