'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DashboardTask } from '@/lib/dashboardTasks';
import type { CompanyEventDto, PersonalChecklistDto } from '@/app/types/calendar';
import {
  formatCompanyEventSchedule,
  formatChecklistDueDate,
  formatCheckoffCompletedAt,
  getChecklistTypeLabel,
  isChecklistPastDue,
} from '@/app/types/calendar';
import type { ChecklistTaxType } from '@/app/types/calendar';
import { prefetchPortal, usePortalTasks, getPortalChurnRecords, getPortalClients, filterNtsTasksForHandledChurn, refreshPortalBootstrap } from '@/app/utils/portalStore';
import PersonalChecklistAddForm from '@/app/components/calendar/PersonalChecklistAddForm';
import CompanyEventAddForm from '@/app/components/calendar/CompanyEventAddForm';
import CenterModal from '@/app/components/portal/CenterModal';
import HomeCalendarProgress from '@/app/components/dashboard/HomeCalendarProgress';
import { canCreateCompanyEvent } from '@/lib/calendarAccess';

const TYPE_LABEL: Record<DashboardTask['type'], string> = {
  consultation_draft: '상담',
  onboarding_incomplete: '유입',
  nts_alert: '국세청',
};

const SECTION_KEY = 'portalTasksSections.v1';

type SectionState = { personal: boolean; company: boolean; client: boolean };
type AddModal = 'personal' | 'company' | null;
type EditModal = 'personal' | 'company' | null;

function readSectionState(): SectionState {
  if (typeof window === 'undefined') return { personal: true, company: true, client: true };
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    if (raw) return JSON.parse(raw) as SectionState;
  } catch { /* ignore */ }
  return { personal: true, company: true, client: true };
}

function taxLabel(taxType: ChecklistTaxType): string {
  return getChecklistTypeLabel(taxType);
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
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
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
  const [personal, setPersonal] = useState<PersonalChecklistDto[]>([]);
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

  const personalPending = useMemo(
    () => personal.filter(p => !p.completed).length,
    [personal],
  );
  const companyPending = useMemo(
    () => companyEvents.filter(e => !e.myCheckoff).length,
    [companyEvents],
  );
  const totalPending = personalPending + companyPending + clientTasks.length;

  const toggleSection = (key: keyof SectionState) => {
    setSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(SECTION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const refresh = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/calendar/personal-checklist'),
        fetch('/api/calendar/company-events'),
      ]);
      const [pData, cData] = await Promise.all([
        pRes.json(),
        cRes.json(),
      ]);
      if (pRes.ok) setPersonal((pData as { items: PersonalChecklistDto[] }).items || []);
      if (cRes.ok) {
        const payload = cData as {
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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
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
    const timer = window.setTimeout(() => {
      void refresh();
    }, 400);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const toggleComplete = async (id: string, completed: boolean) => {
    await fetch(`/api/calendar/personal-checklist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
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
          </div>
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
              onAdd={() => setAddModal('personal')}
            >
                {personal.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">항목 없음</p>
                ) : (
                  <ul className="space-y-1.5">
                    {personal.map(item => (
                      <li
                        key={item.id}
                        onDoubleClick={() => openPersonalEdit(item)}
                        className="relative cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm hover:border-[#4b6cb7]/30"
                        title="더블클릭하여 수정·삭제"
                      >
                        {!item.completed && (
                          <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            !
                          </span>
                        )}
                        <div className="flex items-start gap-2.5 pr-4">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={e => void toggleComplete(item.id, e.target.checked)}
                            onDoubleClick={e => e.stopPropagation()}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold leading-snug ${item.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                              {item.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                {taxLabel(item.taxType)}
                              </span>
                              {item.dueDate && (
                                <span
                                  className={`text-[10px] font-bold ${
                                    !item.completed && isChecklistPastDue(item.dueDate)
                                      ? 'text-red-600'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  마감 {formatChecklistDueDate(item.dueDate)}
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
                                  담당 {item.assigneeNames.join(', ')}
                                </span>
                              )}
                            </div>
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
                    ))}
                  </ul>
                )}
              </SectionCard>

            <SectionCard
              title={companySectionTitle}
              count={companyPending}
              open={sections.company}
              onToggle={() => toggleSection('company')}
              onAdd={canAddCompany ? () => setAddModal('company') : undefined}
            >
                {companyEvents.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">이번 달 일정 없음</p>
                ) : (
                  <ul className="space-y-1.5">
                    {companyEvents.map(ev => {
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
                        <Link
                          href={t.href}
                          className="relative flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm hover:border-[#4b6cb7]/30"
                        >
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
                          <span className="min-w-0 flex-1 pr-4 font-semibold leading-snug text-slate-800">
                            {t.title}
                          </span>
                          {t.type === 'onboarding_incomplete' && t.progress && (
                            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#4b6cb7] ring-1 ring-blue-100">
                              {t.progress.done}/{t.progress.total}
                            </span>
                          )}
                          {t.subtitle && (
                            <span className="text-[10px] text-slate-400">{t.subtitle}</span>
                          )}
                        </Link>
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
        title="개인 체크리스트 수정"
        description="내용을 수정하거나 삭제할 수 있습니다."
        onClose={closeModal}
      >
        {editItem && (
          <PersonalChecklistAddForm
            inModal
            editItem={editItem}
            onUpdated={() => { closeModal(); void refresh(); }}
            onDeleted={() => { closeModal(); void refresh(); }}
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
