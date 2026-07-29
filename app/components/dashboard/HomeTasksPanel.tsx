'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DashboardTask } from '@/lib/dashboardTasks';
import type {
  ChecklistTaxType,
  CompanyEventDto,
  PersonalChecklistDto,
  ProcessedRoutedRequestDto,
} from '@/app/types/calendar';
import {
  formatCalendarCreatedAt,
  formatCompanyEventSchedule,
  formatChecklistDueDate,
  formatCheckoffCompletedAt,
  getChecklistTypeLabel,
  isChecklistPastDue,
  isImprovementRequestTaxType,
  isRoutedRequestTaxType,
  isSuppliesOrderTaxType,
} from '@/app/types/calendar';
import { prefetchPortal, usePortalTasks, getPortalChurnRecords, getPortalClients, filterNtsTasksForHandledChurn, refreshPortalBootstrap } from '@/app/utils/portalStore';
import PersonalChecklistAddForm from '@/app/components/calendar/PersonalChecklistAddForm';
import CompanyEventAddForm from '@/app/components/calendar/CompanyEventAddForm';
import CenterModal from '@/app/components/portal/CenterModal';
import HomeCalendarProgress from '@/app/components/dashboard/HomeCalendarProgress';
import { canCreateCompanyEvent } from '@/lib/calendarAccess';
import { getManagerMatchNames, managerNamesMatch } from '@/app/utils/managerMatch';
import type { LeaveRequestDto } from '@/app/types/leave';
import { formatLeaveKindLabel } from '@/app/types/leave';

const TYPE_LABEL: Record<DashboardTask['type'], string> = {
  consultation_draft: '상담',
  onboarding_incomplete: '유입',
  nts_alert: '국세청',
};

const SECTION_KEY = 'portalTasksSections.v1';
const SHOW_COMPLETED_KEY = 'portalTasksShowCompleted.v1';

type SectionState = {
  personal: boolean;
  company: boolean;
  client: boolean;
  processed: boolean;
  leave: boolean;
};
type AddModal = 'personal' | 'company' | null;
type EditModal = 'personal' | 'company' | null;

function readSectionState(): SectionState {
  if (typeof window === 'undefined') {
    return { personal: true, company: true, client: true, processed: true, leave: true };
  }
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SectionState>;
      return {
        personal: parsed.personal ?? true,
        company: parsed.company ?? true,
        client: parsed.client ?? true,
        processed: parsed.processed ?? true,
        leave: parsed.leave ?? true,
      };
    }
  } catch { /* ignore */ }
  return { personal: true, company: true, client: true, processed: true, leave: true };
}

function readShowCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SHOW_COMPLETED_KEY) === '1';
  } catch { /* ignore */ }
  return false;
}

function taxLabel(taxType: ChecklistTaxType): string {
  return getChecklistTypeLabel(taxType);
}

function personalEditModalMeta(
  item: PersonalChecklistDto | null,
  currentUser: string,
): {
  title: string;
  description?: string;
} {
  const isOwner = Boolean(item && currentUser && managerNamesMatch(item.ownerName, currentUser));
  // 요청자 → 개인 체크리스트 / 그 외(협업자) → 비품·시스템개선 요청
  if (!isOwner && item && isSuppliesOrderTaxType(item.taxType)) {
    return { title: '비품 주문 요청' };
  }
  if (!isOwner && item && isImprovementRequestTaxType(item.taxType)) {
    return { title: '시스템 개선 요청' };
  }
  return {
    title: '개인 체크리스트 수정',
    description: '내용을 수정하거나 삭제할 수 있습니다.',
  };
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SectionCard({
  title,
  count,
  open,
  onToggle,
  onAdd,
  headerAction,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[10px] text-slate-400">{open ? '▼' : '▶'}</span>
          <span className="truncate text-sm font-bold text-slate-800">{title}</span>
        </button>
        <CountBadge count={count} />
        {headerAction}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="shrink-0 rounded-md bg-[#4b6cb7]/10 px-2 py-0.5 text-xs font-bold text-[#4b6cb7] hover:bg-[#4b6cb7]/15"
            title="추가"
          >
            +
          </button>
        )}
      </div>
      {open && <div className="p-2">{children}</div>}
    </div>
  );
}

export default function HomeTasksPanel() {
  const rawClientTasks = usePortalTasks();
  const clientTasks = useMemo(
    () => filterNtsTasksForHandledChurn(rawClientTasks, getPortalChurnRecords(), getPortalClients()),
    [rawClientTasks],
  );
  const [sections, setSections] = useState<SectionState>(readSectionState);
  const [showCompleted, setShowCompleted] = useState(false);
  const [personal, setPersonal] = useState<PersonalChecklistDto[]>([]);
  const [routedOpen, setRoutedOpen] = useState<PersonalChecklistDto[]>([]);
  const [routedShared, setRoutedShared] = useState<ProcessedRoutedRequestDto[]>([]);
  const [companyEvents, setCompanyEvents] = useState<CompanyEventDto[]>([]);
  const [addModal, setAddModal] = useState<AddModal>(null);
  const [editModal, setEditModal] = useState<EditModal>(null);
  const [editItem, setEditItem] = useState<PersonalChecklistDto | null>(null);
  const [editCompany, setEditCompany] = useState<CompanyEventDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [canAddCompany, setCanAddCompany] = useState(false);
  const [canViewCheckoffDetails, setCanViewCheckoffDetails] = useState(false);
  const [companyMonth, setCompanyMonth] = useState<{ year: number; month: number } | null>(null);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [leavePending, setLeavePending] = useState<LeaveRequestDto[]>([]);
  const [canApproveLeaveUi, setCanApproveLeaveUi] = useState(false);

  /** 미완료 배지·필터용 — 비품·시스템개선은 전용 섹션 */
  const isPersonalDone = (p: PersonalChecklistDto) => {
    if (isRoutedRequestTaxType(p.taxType)) return true;
    if (!p.collaborative) return p.completed;
    if (currentUser && p.ownerName === currentUser) {
      return (p.checkoffDone ?? 0) >= (p.checkoffTotal ?? 0);
    }
    return p.myCheckoff ?? p.completed;
  };

  const personalVisible = useMemo(() => {
    const list = showCompleted ? [...personal] : personal.filter(p => !isPersonalDone(p));
    // 마감 임박순 (빠른 날짜 위). 마감 없음은 맨 아래.
    list.sort((a, b) => {
      const ad = a.dueDate?.trim() || '';
      const bd = b.dueDate?.trim() || '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    });
    return list;
    // currentUser: 작성자/협업자 완료 기준이 다름
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personal, showCompleted, currentUser]);
  const companyVisible = useMemo(
    () => (showCompleted ? companyEvents : companyEvents.filter(e => !e.myCheckoff)),
    [companyEvents, showCompleted],
  );

  const personalPending = useMemo(
    () => personal.filter(p => !isPersonalDone(p)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal, currentUser],
  );
  const companyPending = useMemo(
    () => companyEvents.filter(e => !e.myCheckoff).length,
    [companyEvents],
  );
  const totalPending =
    personalPending + companyPending + clientTasks.length + leavePending.length;

  const handleShowCompletedChange = (show: boolean) => {
    setShowCompleted(show);
    try {
      localStorage.setItem(SHOW_COMPLETED_KEY, show ? '1' : '0');
    } catch { /* ignore */ }
  };

  const toggleSection = (key: keyof SectionState) => {
    setSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(SECTION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const refresh = useCallback(async (includeCompleted = showCompleted) => {
    try {
      const personalUrl = includeCompleted
        ? '/api/calendar/personal-checklist?includeCompleted=1'
        : '/api/calendar/personal-checklist';

      // 개인·비품 먼저 그린 뒤 회사일정 — 체감 대기 시간 단축
      const pRes = await fetch(personalUrl);
      if (pRes.ok) {
        const payload = (await pRes.json()) as {
          items: PersonalChecklistDto[];
          routedOpen?: PersonalChecklistDto[];
          routedShared?: ProcessedRoutedRequestDto[];
        };
        setPersonal(payload.items || []);
        setRoutedOpen(payload.routedOpen || []);
        setRoutedShared(payload.routedShared || []);
      }
      setLoading(false);

      const cRes = await fetch('/api/calendar/company-events?home=1');
      if (cRes.ok) {
        const payload = (await cRes.json()) as {
          items: CompanyEventDto[];
          team?: string[];
          month?: { year: number; month: number };
          canViewCheckoffDetails?: boolean;
        };
        setCompanyEvents(payload.items || []);
        setTeamMembers(payload.team || []);
        setCompanyMonth(payload.month ?? null);
        setCanViewCheckoffDetails(!!payload.canViewCheckoffDetails);
      }

      const leaveRes = await fetch('/api/leave/requests?pending=1');
      if (leaveRes.ok) {
        const payload = (await leaveRes.json()) as { items?: LeaveRequestDto[] };
        setLeavePending(payload.items || []);
        setCanApproveLeaveUi(true);
      } else {
        setLeavePending([]);
        setCanApproveLeaveUi(false);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [showCompleted]);

  useEffect(() => {
    setShowCompleted(readShowCompleted());
    try {
      const pendingAdd = sessionStorage.getItem('portalTodoOpenAdd.v1');
      if (pendingAdd === 'personal' || pendingAdd === 'company') {
        sessionStorage.removeItem('portalTodoOpenAdd.v1');
        setAddModal(pendingAdd);
      }
    } catch {
      /* ignore */
    }
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const user = (d as {
          user?: {
            name?: string;
            loginId?: string;
            role?: string | null;
            adminMode?: boolean | null;
          };
          isMaster?: boolean;
          isDeveloper?: boolean;
        });
        setCurrentUser(user.user?.name || '');
        setIsAdmin(!!user.isDeveloper);
        // 서버 isMaster(결재권자·개발자)와 동일 기준으로 회사일정 추가 허용
        setCanAddCompany(
          !!user.isMaster || canCreateCompanyEvent(user.user),
        );
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    void prefetchPortal();
    void refresh(showCompleted);
    const onFocus = () => {
      void refresh(showCompleted);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, showCompleted]);

  const routedVisible = useMemo(() => routedOpen, [routedOpen]);
  const routedSharedById = useMemo(
    () => new Map(routedShared.map(s => [s.id, s])),
    [routedShared],
  );

  const routedPendingCount = useMemo(() => {
    const aliases = currentUser ? getManagerMatchNames(currentUser) : [];
    return routedVisible.filter(item => {
      // 미확인 완료 알림은 배지에 포함
      if (routedSharedById.has(item.id)) return true;
      const handlers = item.participants?.length ? item.participants : item.assigneeNames;
      if (aliases.some(a => handlers.includes(a) || item.assigneeNames.includes(a))) {
        return !(item.myCheckoff ?? false);
      }
      if (aliases.some(a => a === item.ownerName)) {
        return (item.checkoffDone ?? 0) < (item.checkoffTotal ?? 1);
      }
      return !(item.myCheckoff ?? false);
    }).length;
  }, [routedVisible, routedSharedById, currentUser]);

  const toggleComplete = async (id: string, completed: boolean) => {
    await fetch(`/api/calendar/personal-checklist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    void refresh();
  };

  const confirmRoutedDone = async (id: string) => {
    const res = await fetch(`/api/calendar/personal-checklist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismiss: true }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      window.alert(data?.error || '확인 처리에 실패했습니다.');
      return;
    }
    // 즉시 목록에서 제거 (새로고침 전에도 안 보이게)
    setRoutedOpen(prev => prev.filter(item => item.id !== id));
    setRoutedShared(prev => prev.filter(item => item.id !== id));
    void refresh();
  };

  const routedConfirmableIds = useMemo(() => {
    const aliases = currentUser ? getManagerMatchNames(currentUser) : [];
    return routedVisible
      .filter(item => {
        const isHandler = aliases.some(a => {
          const handlers = item.participants?.length ? item.participants : item.assigneeNames;
          return handlers.includes(a) || item.assigneeNames.includes(a);
        });
        const myDone = item.myCheckoff ?? false;
        const isNotifiedDone = routedSharedById.has(item.id);
        return (isHandler && myDone) || isNotifiedDone;
      })
      .map(item => item.id);
  }, [routedVisible, routedSharedById, currentUser]);

  const confirmAllRoutedDone = async () => {
    if (routedConfirmableIds.length === 0) return;
    if (!window.confirm(`확인 가능한 ${routedConfirmableIds.length}건을 일괄 확인할까요?`)) return;
    const results = await Promise.all(
      routedConfirmableIds.map(async id => {
        const res = await fetch(`/api/calendar/personal-checklist/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dismiss: true }),
        });
        return { id, ok: res.ok };
      }),
    );
    const okIds = new Set(results.filter(r => r.ok).map(r => r.id));
    if (okIds.size > 0) {
      setRoutedOpen(prev => prev.filter(item => !okIds.has(item.id)));
      setRoutedShared(prev => prev.filter(item => !okIds.has(item.id)));
    }
    if (okIds.size < routedConfirmableIds.length) {
      window.alert('일부 항목 확인에 실패했습니다. 목록을 새로고침합니다.');
    }
    void refresh();
  };

  const closeModal = () => {
    setAddModal(null);
    setEditModal(null);
    setEditItem(null);
    setEditCompany(null);
  };

  const openPersonalEdit = (item: PersonalChecklistDto) => {
    setEditItem(item);
    setEditModal('personal');
  };

  const openCompanyEdit = (ev: CompanyEventDto) => {
    setEditCompany(ev);
    setEditModal('company');
  };

  const canEditCompany = (ev: CompanyEventDto) =>
    isAdmin || (!!currentUser && ev.createdBy === currentUser);

  const toggleCompanyCheckoff = async (ev: CompanyEventDto, completed: boolean) => {
    await fetch('/api/calendar/company-events/checkoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: ev.id, completed }),
    });
    void refresh();
  };

  const companySectionTitle = companyMonth
    ? `회사 일정 (${companyMonth.month}월)`
    : '회사 일정';

  const editModalMeta = personalEditModalMeta(editItem, currentUser);

  return (
    <>
      <HomeCalendarProgress />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#4b6cb7]/10 text-[#4b6cb7]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </span>
            <h2 className="text-sm font-bold text-slate-800">To Do List</h2>
            <CountBadge count={totalPending} />
            <button
              type="button"
              onClick={() => setAddModal('personal')}
              className="relative ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#4b6cb7]/10 text-sm font-bold text-[#4b6cb7] hover:bg-[#4b6cb7]/15"
              title="체크리스트 추가"
            >
              +
              {personalPending > 0 && (
                <span className="absolute -right-1.5 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {personalPending > 99 ? '99+' : personalPending}
                </span>
              )}
            </button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={e => handleShowCompletedChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            완료일정 표시
          </label>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : (
          <div className="space-y-2 p-2.5">
            <SectionCard
              title="개인 체크리스트"
              count={personalPending}
              open={sections.personal}
              onToggle={() => toggleSection('personal')}
            >
                {personalVisible.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">
                    {showCompleted ? '항목 없음' : '미완료 항목 없음'}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {personalVisible.map(item => {
                      const openForMe = !isPersonalDone(item);
                      const overdue = openForMe && isChecklistPastDue(item.dueDate);
                      const myDone = item.collaborative
                        ? (item.myCheckoff ?? false)
                        : item.completed;
                      const isOwner = !!currentUser && item.ownerName === currentUser;
                      const participants = item.participants ?? [
                        item.ownerName,
                        ...(item.assigneeNames ?? []),
                      ];
                      return (
                      <li
                        key={item.id}
                        onDoubleClick={() => openPersonalEdit(item)}
                        className={`relative cursor-pointer rounded-lg border px-3 py-2.5 text-sm shadow-sm ${
                          overdue
                            ? 'border-red-400 bg-red-50 hover:border-red-500'
                            : 'border-slate-200 bg-white hover:border-[#4b6cb7]/30'
                        }`}
                        title="더블클릭하여 수정·삭제"
                      >
                        {openForMe && (
                          <span className={`absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                            overdue ? 'bg-red-600' : 'bg-red-500'
                          }`}>
                            !
                          </span>
                        )}
                        <div className="flex items-start gap-2.5 pr-4">
                          <input
                            type="checkbox"
                            checked={myDone}
                            onChange={e => void toggleComplete(item.id, e.target.checked)}
                            onDoubleClick={e => e.stopPropagation()}
                            className="mt-0.5"
                            title={item.collaborative ? '내 업무 완료' : '완료'}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold leading-snug ${
                              myDone
                                ? 'text-slate-400 line-through'
                                : overdue
                                  ? 'text-red-800'
                                  : 'text-slate-800'
                            }`}>
                              {item.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                overdue
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {taxLabel(item.taxType)}
                              </span>
                              {item.collaborative && (
                                <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                  협업
                                </span>
                              )}
                              {item.dueDate && (
                                <span
                                  className={`text-[10px] font-bold ${
                                    overdue ? 'text-red-700' : 'text-slate-600'
                                  }`}
                                >
                                  {overdue ? '기한 경과 · ' : ''}마감 {formatChecklistDueDate(item.dueDate)}
                                </span>
                              )}
                              {myDone && !!formatCheckoffCompletedAt(item.myCompletedAt) && (
                                <span className="text-[10px] font-semibold tabular-nums text-emerald-700">
                                  완료 {formatCheckoffCompletedAt(item.myCompletedAt)}
                                </span>
                              )}
                              {item.clientName && (
                                <span className="text-[10px] text-[#4b6cb7]">{item.clientName}</span>
                              )}
                              {item.ownerName && item.ownerName !== currentUser && (
                                <span className="text-[10px] text-slate-500">작성 {item.ownerName}</span>
                              )}
                              {(item.assigneeNames?.length ?? 0) > 0 && (
                                <span className="text-[10px] text-violet-700">
                                  협업 {item.assigneeNames.join(', ')}
                                </span>
                              )}
                            </div>
                            {item.collaborative && (item.checkoffTotal ?? 0) > 0 && (
                              <p className="mt-1 text-[10px] text-slate-400">
                                협업 완료 {item.checkoffDone ?? 0}/{item.checkoffTotal}
                              </p>
                            )}
                            {item.collaborative && participants.length > 0 && (
                              <ul
                                className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5"
                                onClick={e => e.stopPropagation()}
                                onDoubleClick={e => e.stopPropagation()}
                              >
                                {participants.map(name => {
                                  const detail = item.checkoffDetails?.[name];
                                  const memberDone = detail?.completed
                                    ?? item.checkoffs?.[name]
                                    ?? false;
                                  const at = formatCheckoffCompletedAt(detail?.completedAt);
                                  const canSeeAt = isOwner || name === currentUser;
                                  return (
                                    <li
                                      key={name}
                                      className={`text-[10px] ${memberDone ? 'text-emerald-700' : 'text-slate-400'}`}
                                    >
                                      {memberDone ? '✓' : '○'} {name}
                                      {name === item.ownerName ? ' (작성)' : ' (협업)'}
                                      {memberDone && canSeeAt && at
                                        ? ` · ${at}`
                                        : memberDone
                                          ? ' · 완료'
                                          : ' · 미완료'}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {(item.memos?.length ?? 0) > 0 && (
                              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                                <span className="font-semibold text-slate-600">
                                  {item.memos[item.memos.length - 1].authorName}
                                </span>
                                {': '}
                                {item.memos[item.memos.length - 1].body}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

            <SectionCard
              title="비품주문/시스템개선"
              count={routedPendingCount}
              open={sections.processed}
              onToggle={() => toggleSection('processed')}
              headerAction={
                routedConfirmableIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void confirmAllRoutedDone()}
                    className="shrink-0 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                    title="확인 가능한 항목 일괄 확인"
                  >
                    일괄확인 ({routedConfirmableIds.length})
                  </button>
                ) : undefined
              }
            >
              {routedVisible.length === 0 ? (
                <p className="py-3 text-center text-sm text-slate-400">요청 없음</p>
              ) : (
                <ul className="space-y-1.5">
                  {routedVisible.map(item => {
                    const aliases = currentUser ? getManagerMatchNames(currentUser) : [];
                    const isOwner = aliases.some(a => a === item.ownerName);
                    const handlers = item.participants?.length
                      ? item.participants
                      : item.assigneeNames;
                    const isHandler = aliases.some(
                      a => handlers.includes(a) || item.assigneeNames.includes(a),
                    );
                    const myDone = item.myCheckoff ?? false;
                    const shared = routedSharedById.get(item.id);
                    const isNotifiedDone = Boolean(shared);
                    const showDoneStyle = (myDone && isHandler) || isNotifiedDone;
                    const processedBy = shared?.processedBy?.length
                      ? shared.processedBy
                      : Object.entries(item.checkoffs ?? {})
                          .filter(([, done]) => done)
                          .map(([name]) => name);
                    const lastMemo = item.memos?.[item.memos.length - 1];
                    const calendarHref =
                      item.taxType === 'supplies'
                        ? '/calendar?tab=supplies'
                        : '/calendar?tab=improvement';
                    const canConfirm = (isHandler && myDone) || isNotifiedDone;
                    return (
                      <li
                        key={item.id}
                        onClick={() => openPersonalEdit(item)}
                        className={[
                          'cursor-pointer rounded-lg border px-3 py-2.5 text-sm shadow-sm',
                          showDoneStyle
                            ? 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300'
                            : 'border-slate-200 bg-white hover:border-[#4b6cb7]/30',
                        ].join(' ')}
                        title="클릭하여 상세"
                      >
                        <div className="flex items-start gap-2.5">
                          {isHandler && (
                            <input
                              type="checkbox"
                              checked={myDone}
                              onChange={e => void toggleComplete(item.id, e.target.checked)}
                              onClick={e => e.stopPropagation()}
                              className="mt-0.5"
                              title={myDone ? '대기로 되돌리기' : '처리 완료'}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-snug text-slate-800">{item.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={[
                                  'rounded px-2 py-0.5 text-[10px] font-bold',
                                  showDoneStyle
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-600',
                                ].join(' ')}
                              >
                                {taxLabel(item.taxType)}
                              </span>
                              {showDoneStyle ? (
                                <>
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    {processedBy.length > 0
                                      ? `${processedBy.join(', ')} 처리완료`
                                      : '처리완료'}
                                  </span>
                                  {(() => {
                                    const doneAt =
                                      shared?.processedAt
                                      ?? item.myCompletedAt
                                      ?? aliases
                                        .map(a => item.checkoffDetails?.[a]?.completedAt)
                                        .find(Boolean)
                                      ?? Object.values(item.checkoffDetails ?? {})
                                        .filter(d => d.completed && d.completedAt)
                                        .map(d => d.completedAt as string)
                                        .sort()
                                        .at(-1)
                                      ?? null;
                                    const label = formatCheckoffCompletedAt(doneAt);
                                    return label ? (
                                      <span className="text-[10px] font-semibold tabular-nums text-emerald-700">
                                        {label}
                                      </span>
                                    ) : null;
                                  })()}
                                </>
                              ) : (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                  대기
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500">
                                {isOwner ? '내가 요청' : `요청 ${item.ownerName}`}
                              </span>
                              {(item.participants ?? item.assigneeNames)?.length > 0 && (
                                <span className="text-[10px] text-violet-700">
                                  협력{' '}
                                  {(item.participants ?? item.assigneeNames).map((name, idx, arr) => {
                                    const isImprove = item.taxType === 'improvement';
                                    const did = processedBy.some(
                                      p => p === name || getManagerMatchNames(p).includes(name),
                                    );
                                    const someoneDone = isImprove && processedBy.length > 0;
                                    const strike = someoneDone && !did;
                                    return (
                                      <span key={name}>
                                        <span
                                          className={
                                            strike
                                              ? 'text-slate-400 line-through'
                                              : did && someoneDone
                                                ? 'font-semibold text-emerald-700'
                                                : undefined
                                          }
                                        >
                                          {name}
                                        </span>
                                        {idx < arr.length - 1 ? ', ' : ''}
                                      </span>
                                    );
                                  })}
                                </span>
                              )}
                            </div>
                            {lastMemo && (
                              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                                <span className="font-semibold text-slate-600">{lastMemo.authorName}</span>
                                {': '}
                                {lastMemo.body}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {canConfirm && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    void confirmRoutedDone(item.id);
                                  }}
                                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                                >
                                  확인
                                </button>
                              )}
                              <Link
                                href={calendarHref}
                                onClick={e => e.stopPropagation()}
                                className="text-[11px] font-semibold text-[#4b6cb7] underline-offset-2 hover:underline"
                              >
                                캘린더에서 보기
                              </Link>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            {canApproveLeaveUi && (
              <SectionCard
                title="휴가 결재"
                count={leavePending.length}
                open={sections.leave}
                onToggle={() => toggleSection('leave')}
              >
                {leavePending.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">결재 대기 없음</p>
                ) : (
                  <ul className="space-y-1.5">
                    {leavePending.map(item => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5 text-sm shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-slate-800">{item.applicantName}</p>
                          <span className="rounded bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                            {formatLeaveKindLabel(item.leaveKind, item.halfSlot)}
                          </span>
                          <span className="text-[11px] font-semibold text-teal-800">{item.days}일</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {item.startDate}
                          {item.endDate !== item.startDate ? ` ~ ${item.endDate}` : ''}
                          {item.title ? ` · ${item.title}` : ''}
                        </p>
                        <Link
                          href="/leave"
                          className="mt-2 inline-block text-[11px] font-semibold text-teal-700 underline-offset-2 hover:underline"
                        >
                          휴가관리에서 결재
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            )}

            <SectionCard
              title={companySectionTitle}
              count={companyPending}
              open={sections.company}
              onToggle={() => toggleSection('company')}
              onAdd={canAddCompany ? () => setAddModal('company') : undefined}
            >
                {companyVisible.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">
                    {showCompleted ? '이번 달 일정 없음' : '미완료 일정 없음'}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {companyVisible.map(ev => {
                      const isTax = ev.source === 'tax_deadline';
                      return (
                      <li
                        key={ev.id}
                        className={`relative rounded-lg px-3 py-2.5 text-sm ${
                          isTax
                            ? 'border border-[#1e3a8a] bg-transparent'
                            : 'border border-slate-200 bg-white shadow-sm'
                        }`}
                      >
                        {!ev.myCheckoff && (
                          <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            !
                          </span>
                        )}
                        <div className="flex items-start gap-2 pr-4">
                          <input
                            type="checkbox"
                            checked={ev.myCheckoff ?? false}
                            onChange={e => void toggleCompanyCheckoff(ev, e.target.checked)}
                            className="mt-1 shrink-0"
                            title="내 업무 완료"
                          />
                          <div
                            className={`min-w-0 flex-1 ${!isTax && canEditCompany(ev) ? 'cursor-pointer' : ''}`}
                            onClick={() => !isTax && canEditCompany(ev) && openCompanyEdit(ev)}
                            title={!isTax && canEditCompany(ev) ? '클릭하여 수정·삭제' : undefined}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p
                                className={`font-semibold leading-snug ${
                                  ev.myCheckoff
                                    ? 'text-slate-400 line-through'
                                    : isTax
                                      ? 'text-[#1e3a8a]'
                                      : 'text-slate-800'
                                }`}
                              >
                                {ev.title}
                              </p>
                              {isTax && (
                                <span className="rounded border border-[#1e3a8a]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#1e3a8a]">
                                  세무신고
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              {isTax && ev.description
                                ? `${ev.description} · ${formatCompanyEventSchedule(ev)}`
                                : formatCompanyEventSchedule(ev)}
                            </p>
                            {(ev.checkoffTotal ?? teamMembers.length) > 0 && (
                              <p className="mt-1 text-[10px] text-slate-400">
                                팀 완료 {ev.checkoffDone ?? 0}/{ev.checkoffTotal ?? teamMembers.length}
                              </p>
                            )}
                            {canViewCheckoffDetails && teamMembers.length > 0 && (
                              <ul
                                className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5"
                                onClick={e => e.stopPropagation()}
                              >
                                {teamMembers.map(name => {
                                  const detail = ev.checkoffDetails?.[name];
                                  const done = detail?.completed ?? ev.checkoffs?.[name] ?? false;
                                  const at = formatCheckoffCompletedAt(detail?.completedAt);
                                  return (
                                    <li
                                      key={name}
                                      className={`text-[10px] ${done ? 'text-emerald-700' : 'text-slate-400'}`}
                                    >
                                      {done ? '✓' : '○'} {name}
                                      {done && at ? ` · ${at}` : done ? ' · 완료' : ' · 미완료'}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

            <SectionCard
              title="업체 관련"
              count={clientTasks.length}
              open={sections.client}
              onToggle={() => toggleSection('client')}
            >
                {clientTasks.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">할 일 없음</p>
                ) : (
                  <ul className="space-y-1.5">
                    {clientTasks.map(t => (
                      <li key={t.id}>
                        <div className="relative flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm hover:border-[#4b6cb7]/30">
                          <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            1
                          </span>
                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                              t.type === 'nts_alert'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-50 text-[#4b6cb7]'
                            }`}
                          >
                            {TYPE_LABEL[t.type]}
                          </span>
                          <Link
                            href={t.href}
                            className="min-w-0 flex-1 pr-4 font-semibold leading-snug text-slate-800 hover:underline"
                          >
                            {t.title}
                          </Link>
                          {t.type === 'onboarding_incomplete' && t.progress && (
                            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#4b6cb7] ring-1 ring-blue-100">
                              {t.progress.done}/{t.progress.total}
                            </span>
                          )}
                          {t.subtitle && (
                            <span className="text-[10px] text-slate-400">{t.subtitle}</span>
                          )}
                          {t.type === 'nts_alert' && t.ntsKind === 'resting' && t.clientId ? (
                            <button
                              type="button"
                              className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                              onClick={async e => {
                                e.preventDefault();
                                try {
                                  const res = await fetch(`/api/clients/${t.clientId}/nts-ack`, {
                                    method: 'POST',
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data.error || '확인 실패');
                                  await refreshPortalBootstrap();
                                } catch (err) {
                                  window.alert(err instanceof Error ? err.message : '확인 실패');
                                }
                              }}
                            >
                              확인
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
          </div>
        )}
      </section>

      <CenterModal
        open={editModal === 'personal' && editItem !== null}
        title={editModalMeta.title}
        description={editModalMeta.description}
        onClose={closeModal}
      >
        {editItem && (
          <PersonalChecklistAddForm
            inModal
            editItem={editItem}
            onUpdated={(item) => {
              if (item) setEditItem(item);
              void refresh();
            }}
            onDeleted={() => { closeModal(); void refresh(); }}
            onCheckoffChange={(item) => {
              if (item) setEditItem(item);
              void refresh();
            }}
            onCancel={closeModal}
          />
        )}
      </CenterModal>

      <CenterModal
        open={editModal === 'company' && editCompany !== null}
        title="회사 일정 수정"
        description="내용을 수정하거나 삭제할 수 있습니다."
        onClose={closeModal}
      >
        {editCompany && (
          <CompanyEventAddForm
            inModal
            editItem={editCompany}
            onUpdated={() => { closeModal(); void refresh(); }}
            onDeleted={() => { closeModal(); void refresh(); }}
            onCancel={closeModal}
          />
        )}
      </CenterModal>

      <CenterModal
        open={addModal === 'personal'}
        title="개인 체크리스트 추가"
        description="구분 선택 후 체크리스트를 등록합니다."
        onClose={closeModal}
      >
        <PersonalChecklistAddForm
          inModal
          onCreated={() => { closeModal(); void refresh(); }}
          onCancel={closeModal}
        />
      </CenterModal>

      <CenterModal
        open={addModal === 'company'}
        title="회사 일정 추가"
        description="사내 일정을 등록합니다."
        onClose={closeModal}
      >
        <CompanyEventAddForm
          inModal
          onCreated={() => { closeModal(); void refresh(); }}
          onCancel={closeModal}
        />
      </CenterModal>
    </>
  );
}
