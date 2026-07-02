'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardTask } from '@/lib/dashboardTasks';
import type { CompanyEventDto, PersonalChecklistDto } from '@/app/types/calendar';
import { formatCalendarCreatedAt, formatCompanyEventSchedule } from '@/app/types/calendar';
import { CHECKLIST_TAX_OPTIONS } from '@/app/types/calendar';
import { prefetchPortal, usePortalTasks } from '@/app/utils/portalStore';
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

function taxLabel(taxType: string): string {
  return CHECKLIST_TAX_OPTIONS.find(t => t.id === taxType)?.label || taxType;
}

function SectionHeader({
  title,
  open,
  onToggle,
  onAdd,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/70 px-2 py-1 ring-1 ring-amber-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-2 text-left text-sm font-bold text-amber-950 py-1"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] text-amber-700">
          {open ? '▼' : '▶'}
        </span>
        {title}
      </button>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
          title="추가"
        >
          +
        </button>
      )}
    </div>
  );
}

export default function HomeTasksPanel() {
  const clientTasks = usePortalTasks();
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
  const [companyMonth, setCompanyMonth] = useState<{ year: number; month: number } | null>(null);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);

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
        };
        setCompanyEvents(payload.items || []);
        setTeamMembers(payload.team || []);
        setCompanyMonth(payload.month ?? null);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const user = (d as { user?: { name?: string; loginId?: string } })?.user;
        setCurrentUser(user?.name || '');
        setIsAdmin(!!(d as { isMaster?: boolean })?.isMaster);
        setCanAddCompany(canCreateCompanyEvent(user));
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    void prefetchPortal();
    const timer = window.setTimeout(() => {
      void refresh();
    }, 400);
    const onFocus = () => {
      void prefetchPortal(true);
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
    ? `2. 회사 일정 (${companyMonth.month}월)`
    : '2. 회사 일정';

  return (
    <>
      <HomeCalendarProgress />
      <section className="rounded-2xl border border-rose-200/90 bg-gradient-to-b from-rose-100 via-pink-50 to-white p-3 shadow-sm">
        <div className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-rose-100/90">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm text-rose-500">
              *
            </span>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-rose-950">TO Do List</h2>
              <p className="text-xs text-rose-900/70 mt-0.5">개인 · 회사 · 업체</p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-rose-900/70 text-center py-4">불러오는 중…</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-2.5">
              <SectionHeader
                title="1. 개인 체크리스트"
                open={sections.personal}
                onToggle={() => toggleSection('personal')}
                onAdd={() => setAddModal('personal')}
              />
              {sections.personal && (
                <div className="space-y-1.5 mt-1">
                  {personal.length === 0 ? (
                    <p className="text-sm text-amber-900/60 py-2 text-center">항목 없음</p>
                  ) : (
                    <ul className="space-y-1">
                      {personal.map(item => (
                        <li
                          key={item.id}
                          onDoubleClick={() => openPersonalEdit(item)}
                          className="flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-sm cursor-pointer shadow-[0_1px_0_rgba(251,191,36,0.08)] hover:border-amber-300 hover:bg-amber-50/40"
                          title="더블클릭하여 수정·삭제"
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={e => void toggleComplete(item.id, e.target.checked)}
                            onDoubleClick={e => e.stopPropagation()}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 leading-snug">{item.title}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                                {item.category === 'tax' ? taxLabel(item.taxType) : '기타'}
                              </span>
                              {item.clientName && (
                                <span className="text-xs text-slate-500">{item.clientName}</span>
                              )}
                              {item.reflectInNotes && (
                                <span className="text-xs text-blue-600">특이사항 반영</span>
                              )}
                              {item.createdAt && (
                                <span className="text-xs text-slate-400">
                                  등록 {formatCalendarCreatedAt(item.createdAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-pink-100 bg-pink-50/55 p-2.5">
              <SectionHeader
                title={companySectionTitle}
                open={sections.company}
                onToggle={() => toggleSection('company')}
                onAdd={canAddCompany ? () => setAddModal('company') : undefined}
              />
              {sections.company && (
                <div className="space-y-1.5 mt-1">
                  {companyEvents.map(ev => (
                    <div
                      key={ev.id}
                      className="flex items-start gap-2 rounded-2xl border border-sky-100 bg-white px-3 py-2.5 text-sm shadow-[0_1px_0_rgba(125,211,252,0.08)]"
                    >
                      <input
                        type="checkbox"
                        checked={ev.myCheckoff ?? false}
                        onChange={e => void toggleCompanyCheckoff(ev, e.target.checked)}
                        className="mt-1 shrink-0"
                        title="내 업무 완료"
                      />
                      <div
                        className={`min-w-0 flex-1 ${canEditCompany(ev) ? 'cursor-pointer' : ''}`}
                        onClick={() => canEditCompany(ev) && openCompanyEdit(ev)}
                        title={canEditCompany(ev) ? '클릭하여 수정·삭제' : undefined}
                      >
                        <p className="font-semibold text-sky-900 leading-snug">{ev.title}</p>
                        <p className="text-xs text-sky-700 mt-1 leading-relaxed">
                          {formatCompanyEventSchedule(ev)}
                        </p>
                        {ev.createdAt && (
                          <p className="text-xs text-slate-400 mt-1">
                            등록 {formatCalendarCreatedAt(ev.createdAt)}
                          </p>
                        )}
                        {(ev.checkoffTotal ?? teamMembers.length) > 0 && (
                          <p className="text-xs text-slate-500 mt-1">
                            팀 완료 {ev.checkoffDone ?? 0}/{ev.checkoffTotal ?? teamMembers.length}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {companyEvents.length === 0 && (
                    <p className="text-sm text-amber-900/60 py-2 text-center">이번 달 일정 없음</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/45 p-2.5">
              <SectionHeader
                title="3. 업체관련"
                open={sections.client}
                onToggle={() => toggleSection('client')}
              />
              {sections.client && (
                <ul className="space-y-1.5 mt-1">
                  {clientTasks.length === 0 ? (
                    <p className="text-sm text-amber-900/60 py-2 text-center">할 일 없음</p>
                  ) : (
                    clientTasks.map(t => (
                      <li key={t.id}>
                        <Link
                          href={t.href}
                          className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-100 bg-white px-3 py-2.5 text-sm hover:border-rose-200 hover:shadow-sm transition-shadow"
                        >
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${
                              t.type === 'nts_alert'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {TYPE_LABEL[t.type]}
                          </span>
                          <span className="font-semibold text-slate-800 flex-1 min-w-0 leading-snug">{t.title}</span>
                          {t.subtitle && <span className="text-xs text-slate-500">{t.subtitle}</span>}
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
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
        description="세목·기타 구분 후 체크리스트를 등록합니다."
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
