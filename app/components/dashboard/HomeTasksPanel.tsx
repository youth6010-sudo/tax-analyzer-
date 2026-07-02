'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardTask } from '@/lib/dashboardTasks';
import type { CompanyEventDto, PersonalChecklistDto } from '@/app/types/calendar';
import { formatCompanyEventSchedule } from '@/app/types/calendar';
import { CHECKLIST_TAX_OPTIONS } from '@/app/types/calendar';
import { prefetchPortal, usePortalTasks } from '@/app/utils/portalStore';
import PersonalChecklistAddForm from '@/app/components/calendar/PersonalChecklistAddForm';
import CompanyEventAddForm from '@/app/components/calendar/CompanyEventAddForm';
import CenterModal from '@/app/components/portal/CenterModal';

const TYPE_LABEL: Record<DashboardTask['type'], string> = {
  consultation_draft: '상담',
  onboarding_incomplete: '유입',
  nts_alert: '국세청',
};

const SECTION_KEY = 'portalTasksSections.v1';

type SectionState = { personal: boolean; company: boolean; client: boolean };
type AddModal = 'personal' | 'company' | null;

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
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-1.5 text-left text-sm font-bold text-amber-950 py-1"
      >
        <span className="text-xs text-amber-700">{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
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
  const [loading, setLoading] = useState(true);

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
      if (cRes.ok) setCompanyEvents((cData as { items: CompanyEventDto[] }).items || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
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

  const closeModal = () => setAddModal(null);

  return (
    <>
      <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 shadow-sm">
        <h2 className="text-base font-bold text-amber-950">To De List</h2>
        <p className="text-xs text-amber-900/80 mt-0.5">개인 · 회사 · 업체</p>

        {loading ? (
          <p className="mt-4 text-sm text-amber-900/70 text-center py-4">불러오는 중…</p>
        ) : (
          <div className="mt-2 space-y-3">
            <div>
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
                          className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-white px-3 py-2.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={e => void toggleComplete(item.id, e.target.checked)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 leading-snug">{item.title}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                                {item.category === 'tax' ? taxLabel(item.taxType) : '기타'}
                              </span>
                              {item.clientName && (
                                <span className="text-xs text-slate-500">{item.clientName}</span>
                              )}
                              {item.reflectInNotes && (
                                <span className="text-xs text-blue-600">특이사항 반영</span>
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

            <div className="border-t border-amber-200/80 pt-2">
              <SectionHeader
                title="2. 회사 일정"
                open={sections.company}
                onToggle={() => toggleSection('company')}
                onAdd={() => setAddModal('company')}
              />
              {sections.company && (
                <div className="space-y-1.5 mt-1">
                  {companyEvents.map(ev => (
                    <div
                      key={ev.id}
                      className="rounded-lg border border-sky-100 bg-white px-3 py-2.5 text-sm"
                    >
                      <p className="font-semibold text-sky-900 leading-snug">{ev.title}</p>
                      <p className="text-xs text-sky-700 mt-1 leading-relaxed">
                        {formatCompanyEventSchedule(ev)}
                      </p>
                    </div>
                  ))}
                  {companyEvents.length === 0 && (
                    <p className="text-sm text-amber-900/60 py-2 text-center">일정 없음</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-amber-200/80 pt-2">
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
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2.5 text-sm hover:border-amber-300 hover:shadow-sm transition-shadow"
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
