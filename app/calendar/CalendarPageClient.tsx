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
import {
  formatCalendarCreatedAt,
  formatCheckoffCompletedAt,
  isImprovementRequestTaxType,
  isRoutedRequestTaxType,
  isSuppliesOrderTaxType,
} from '@/app/types/calendar';
import {
  formatCalendarDateLabel,
  resolveEventChipColor,
  isTaxDeadlineChipColor,
} from '@/lib/calendarManagerColors';
import {
  canDeleteCalendarEvent,
  companyEventFromCalendar,
  deleteCalendarEvent,
} from '@/lib/calendarEventClient';
import CenterModal from '@/app/components/portal/CenterModal';
import PersonalChecklistAddForm from '@/app/components/calendar/PersonalChecklistAddForm';
import CompanyEventAddForm from '@/app/components/calendar/CompanyEventAddForm';
import SuppliesOrderList from '@/app/components/calendar/SuppliesOrderList';
import ImprovementRequestList from '@/app/components/calendar/ImprovementRequestList';

const TEAM_FILTER_KEY = 'calendarTeamFilter.v1';
const SHOW_COMPANY_KEY = 'calendarShowCompany.v1';
const SHOW_TAX_KEY = 'calendarShowTax.v1';
const HIDE_COMPLETED_KEY = 'calendarHideCompleted.v1';

function kindBadgeLabel(kind: CalendarEventDto['kind']): string {
  if (kind === 'company') return '사내';
  if (kind === 'tax_deadline') return '세무신고';
  if (kind === 'client_task') return '수임처';
  return '개인';
}

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

function readStoredShowTax(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(SHOW_TAX_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch { /* ignore */ }
  return true;
}

function readStoredHideCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(HIDE_COMPLETED_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch { /* ignore */ }
  return false;
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
  const tabParam = searchParams.get('tab');

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
  const [showTax, setShowTax] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [editItem, setEditItem] = useState<PersonalChecklistDto | null>(null);
  const [editCompany, setEditCompany] = useState<CompanyEventDto | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDto | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewCheckoffDetails, setCanViewCheckoffDetails] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pageTab, setPageTab] = useState<'calendar' | 'supplies' | 'improvement'>(
    tabParam === 'supplies' || tabParam === 'improvement' ? tabParam : 'calendar',
  );

  useEffect(() => {
    if (tabParam === 'supplies' || tabParam === 'improvement' || tabParam === 'calendar') {
      setPageTab(tabParam);
    }
  }, [tabParam]);

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
        setShowTax(readStoredShowTax());
        setHideCompleted(readStoredHideCompleted());
        const stored = readStoredTeam(me);
        const valid = (stored || [me]).filter(n => team.includes(n));
        setSelectedOwners(valid.length > 0 ? valid : [me]);
      })
      .catch(() => { /* ignore */ });
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        setIsAdmin(!!(d as { isDeveloper?: boolean })?.isDeveloper);
        setCanViewCheckoffDetails(!!(d as { isMaster?: boolean })?.isMaster);
      })
      .catch(() => { /* ignore */ });
  }, []);

  const handleShowCompanyChange = (show: boolean) => {
    setShowCompany(show);
    try {
      localStorage.setItem(SHOW_COMPANY_KEY, show ? '1' : '0');
    } catch { /* ignore */ }
  };

  const handleShowTaxChange = (show: boolean) => {
    setShowTax(show);
    try {
      localStorage.setItem(SHOW_TAX_KEY, show ? '1' : '0');
    } catch { /* ignore */ }
  };

  const handleHideCompletedChange = (hide: boolean) => {
    setHideCompleted(hide);
    try {
      localStorage.setItem(HIDE_COMPLETED_KEY, hide ? '1' : '0');
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
      if (res.ok) {
        const payload = data as { items: CalendarEventDto[]; canViewCheckoffDetails?: boolean };
        const items = payload.items || [];
        setEvents(items);
        if (typeof payload.canViewCheckoffDetails === 'boolean') {
          setCanViewCheckoffDetails(payload.canViewCheckoffDetails);
        }
        setSelectedEvent(prev => {
          if (!prev) return prev;
          return items.find(e => e.id === prev.id) ?? prev;
        });
      }
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
    () =>
      events.filter(ev => {
        if (ev.kind === 'company' && !showCompany) return false;
        if (ev.kind === 'tax_deadline' && !showTax) return false;
        if (hideCompleted && ev.completed) return false;
        return true;
      }),
    [events, showCompany, showTax, hideCompleted],
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

  const checkoffApiId = (ev: CalendarEventDto): string | null => {
    if (ev.kind === 'tax_deadline') return ev.id;
    if (ev.kind === 'company' && ev.id.startsWith('company-')) {
      return ev.id.slice('company-'.length);
    }
    return null;
  };

  const toggleSelectedCheckoff = async (completed: boolean) => {
    if (!selectedEvent) return;
    const eventId = checkoffApiId(selectedEvent);
    if (!eventId) return;
    await fetch('/api/calendar/company-events/checkoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, completed }),
    });
    void loadEvents();
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
                className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                  isTaxDeadlineChipColor(color)
                    ? color
                    : `ring-1 ring-black/10 ${color}`
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm font-semibold ${
                      ev.completed ? 'text-slate-400 line-through' : 'text-slate-900'
                    }`}
                  >
                    {title}
                  </p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {kindBadgeLabel(ev.kind)}
                  </span>
                  {ev.completed ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      완료
                    </span>
                  ) : null}
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
        <div className="mb-4 flex rounded-lg border border-slate-200 p-0.5 text-sm font-semibold w-fit">
          <button
            type="button"
            onClick={() => setPageTab('calendar')}
            className={`rounded-md px-3 py-1.5 ${
              pageTab === 'calendar' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            캘린더
          </button>
          <button
            type="button"
            onClick={() => setPageTab('supplies')}
            className={`rounded-md px-3 py-1.5 ${
              pageTab === 'supplies' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            비품 주문 목록
          </button>
          <button
            type="button"
            onClick={() => setPageTab('improvement')}
            className={`rounded-md px-3 py-1.5 ${
              pageTab === 'improvement' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            시스템 개선 요청
          </button>
        </div>

        {pageTab === 'supplies' ? (
          <SuppliesOrderList />
        ) : pageTab === 'improvement' ? (
          <ImprovementRequestList />
        ) : (
        <>
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
            showTax={showTax}
            onShowTaxChange={handleShowTaxChange}
            hideCompleted={hideCompleted}
            onHideCompletedChange={handleHideCompletedChange}
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
                  {selectedEvent.kind === 'company'
                    ? '사내 일정'
                    : selectedEvent.kind === 'tax_deadline'
                      ? '세무신고일정'
                      : '개인 체크리스트'}
                  {selectedEvent.subtitle ? ` · ${selectedEvent.subtitle}` : ''}
                </p>
                {selectedEvent.createdAt && (
                  <p className="mt-1 text-xs text-slate-400">
                    등록 {formatCalendarCreatedAt(selectedEvent.createdAt)}
                  </p>
                )}
                {(selectedEvent.kind === 'company' || selectedEvent.kind === 'tax_deadline') && (
                  <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!selectedEvent.completed}
                      onChange={e => void toggleSelectedCheckoff(e.target.checked)}
                    />
                    내 업무 완료
                  </label>
                )}
                {(selectedEvent.kind === 'company' || selectedEvent.kind === 'tax_deadline') &&
                  (selectedEvent.checkoffTotal ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    팀 완료 {selectedEvent.checkoffDone ?? 0}/{selectedEvent.checkoffTotal}
                  </p>
                )}
                {canViewCheckoffDetails &&
                  (selectedEvent.kind === 'company' || selectedEvent.kind === 'tax_deadline') &&
                  members.length > 0 && (
                  <ul className="mt-2 space-y-0.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    {members.map(name => {
                      const detail = selectedEvent.checkoffDetails?.[name];
                      const done = detail?.completed ?? false;
                      const at = formatCheckoffCompletedAt(detail?.completedAt);
                      return (
                        <li
                          key={name}
                          className={`text-xs ${done ? 'text-emerald-700' : 'text-slate-400'}`}
                        >
                          {done ? '✓' : '○'} {name}
                          {done && at ? ` · ${at}` : done ? ' · 완료' : ' · 미완료'}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.kind === 'personal' && (
                  <button
                    type="button"
                    onClick={() => void openChecklistEdit(selectedEvent)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {selectedEvent.ownerName === currentUser ? '수정' : '메모·확인'}
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
        </>
        )}
      </div>

      <CenterModal
        open={editItem !== null}
        title={
          editItem &&
          currentUser &&
          editItem.ownerName !== currentUser &&
          isSuppliesOrderTaxType(editItem.taxType)
            ? '비품 주문 요청'
            : editItem &&
                currentUser &&
                editItem.ownerName !== currentUser &&
                isImprovementRequestTaxType(editItem.taxType)
              ? '시스템 개선 요청'
              : '개인 체크리스트 수정'
        }
        description={
          editItem &&
          currentUser &&
          editItem.ownerName !== currentUser &&
          isRoutedRequestTaxType(editItem.taxType)
            ? undefined
            : '내용을 수정한 뒤 저장하세요.'
        }
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
            onCheckoffChange={() => void loadEvents()}
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
