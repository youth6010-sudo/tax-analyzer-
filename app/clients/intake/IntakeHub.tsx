'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import IntakeTabs, { resolveIntakeTab } from '../../components/intake/IntakeTabs';
import ConsultationFormPanel from '../../components/intake/ConsultationFormPanel';
import IntakeSplitView from '../../components/intake/IntakeSplitView';
import PortalPageShell from '../../components/portal/PortalPageShell';
import { portalFooterMeta, portalInput, portalSelect, portalToolbar } from '../../components/portal/uiClasses';
import {
  buildIntakeDeepLink,
  companyMatchKeys,
  findInquiryForProcess,
  findProcessForInquiry,
  inquiryConsultTypes,
  normalizeCompanyKey,
  sortInquiries,
  sortProcesses,
  type ClientNameRef,
  type InquiryRow,
  type IntakeSort,
  type ProcessRow,
} from '../../components/intake/intakeUtils';
import type { ChecklistKey } from '@/app/types/intake';
import { formatIntakeDate } from '@/app/utils/intakeDates';
import {
  getPortalClients,
  getPortalInquiries,
  getPortalProcesses,
  patchPortalInquiry,
  patchPortalIntake,
  patchPortalProcess,
  subscribePortal,
} from '@/app/utils/portalStore';
import ScopeToggle from '@/app/components/portal/ScopeToggle';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { CONSULT_TYPE_OPTIONS } from '@/lib/consultTypes';

function pick(raw: Record<string, unknown>, camel: string, snake?: string): unknown {
  if (raw[camel] !== undefined && raw[camel] !== null) return raw[camel];
  if (snake && raw[snake] !== undefined && raw[snake] !== null) return raw[snake];
  return undefined;
}

function normalizeInquiry(raw: Record<string, unknown>): InquiryRow {
  const created = pick(raw, 'createdAt', 'created_at');
  return {
    id: String(pick(raw, 'id') ?? ''),
    clientId: pick(raw, 'clientId', 'client_id') != null ? String(pick(raw, 'clientId', 'client_id')) : null,
    companyName: String(pick(raw, 'companyName', 'company_name') ?? ''),
    phone: String(pick(raw, 'phone') ?? ''),
    channel: String(pick(raw, 'channel') ?? ''),
    consultant: String(pick(raw, 'consultant') ?? ''),
    inquiryDate: formatIntakeDate(String(pick(raw, 'inquiryDate', 'inquiry_date') ?? '')),
    inquiryContent: String(pick(raw, 'inquiryContent', 'inquiry_content') ?? ''),
    contractStatus: String(pick(raw, 'contractStatus', 'contract_status') ?? ''),
    proposedFee: typeof pick(raw, 'proposedFee', 'proposed_fee') === 'number'
      ? (pick(raw, 'proposedFee', 'proposed_fee') as number)
      : null,
    industry: String(pick(raw, 'industry') ?? ''),
    businessNo: String(pick(raw, 'businessNo', 'business_no') ?? ''),
    representative: String(pick(raw, 'representative') ?? ''),
    address: String(pick(raw, 'address') ?? ''),
    extra: (pick(raw, 'extra') && typeof pick(raw, 'extra') === 'object'
      ? pick(raw, 'extra')
      : {}) as Record<string, unknown>,
    createdAt: created instanceof Date ? created.toISOString() : String(created ?? ''),
    excelKey: pick(raw, 'excelKey', 'excel_key') != null ? String(pick(raw, 'excelKey', 'excel_key')) : undefined,
  };
}

function normalizeProcess(raw: Record<string, unknown>): ProcessRow {
  const updated = pick(raw, 'updatedAt', 'updated_at');
  const rawChecklist = (pick(raw, 'checklist') && typeof pick(raw, 'checklist') === 'object'
    ? pick(raw, 'checklist')
    : {}) as ProcessRow['checklist'];
  const checklist = { ...rawChecklist };
  if (checklist.bluehole && !checklist.blueholeClient) {
    checklist.blueholeClient = checklist.bluehole as boolean;
    delete checklist.bluehole;
  }
  return {
    id: String(pick(raw, 'id') ?? ''),
    clientId: pick(raw, 'clientId', 'client_id') != null ? String(pick(raw, 'clientId', 'client_id')) : null,
    companyName: String(pick(raw, 'companyName', 'company_name') ?? ''),
    feeStartDate: String(pick(raw, 'feeStartDate', 'fee_start_date') ?? ''),
    monthlyFee: typeof pick(raw, 'monthlyFee', 'monthly_fee') === 'number'
      ? (pick(raw, 'monthlyFee', 'monthly_fee') as number)
      : null,
    channel: String(pick(raw, 'channel') ?? ''),
    checklist,
    excelKey: pick(raw, 'excelKey', 'excel_key') != null ? String(pick(raw, 'excelKey', 'excel_key')) : undefined,
    updatedAt: updated instanceof Date ? updated.toISOString() : String(updated ?? ''),
  };
}

function IntakeToolbar({
  search,
  sort,
  scope,
  consultTypeFilters,
  onSearchChange,
  onSortChange,
  onScopeChange,
  onToggleConsultType,
}: {
  search: string;
  sort: IntakeSort;
  scope: 'mine' | 'all';
  consultTypeFilters: string[];
  onSearchChange: (v: string) => void;
  onSortChange: (v: IntakeSort) => void;
  onScopeChange: (v: 'mine' | 'all') => void;
  onToggleConsultType: (v: string) => void;
}) {
  const consultTypes = CONSULT_TYPE_OPTIONS;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold text-slate-500">문의유형</span>
        {consultTypes.map(type => {
          const active = consultTypeFilters.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleConsultType(type)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                active
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>
      <div className={`${portalToolbar} flex-wrap`}>
        <ScopeToggle value={scope} onChange={onScopeChange} />
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="상호 검색…"
          className={`${portalInput} w-full max-w-md`}
        />
        <select
          value={sort}
          onChange={e => onSortChange(e.target.value as IntakeSort)}
          className={portalSelect}
          aria-label="정렬"
        >
          <option value="inquiryDate">문의일순</option>
          <option value="name">이름순</option>
        </select>
      </div>
    </div>
  );
}

export default function IntakeHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = resolveIntakeTab(searchParams.get('tab'));
  const draftId = searchParams.get('draft');
  const urlInquiry = searchParams.get('inquiry');
  const urlProcessId = searchParams.get('processId');
  const urlQ = searchParams.get('q')?.trim() ?? '';

  const urlSort = searchParams.get('sort');
  const sort: IntakeSort = urlSort === 'name'
    ? 'name'
    : urlSort === 'created'
      ? 'created'
      : 'inquiryDate';

  const [search, setSearch] = useState(urlQ);
  const [inquiries, setInquiries] = useState<InquiryRow[]>(() =>
    getPortalInquiries().map(r => normalizeInquiry(r)),
  );
  const [processes, setProcesses] = useState<ProcessRow[]>(() =>
    getPortalProcesses().map(r => normalizeProcess(r)),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(
    () => getPortalInquiries().length === 0 && getPortalProcesses().length === 0,
  );
  const [selectedId, setSelectedId] = useState<string | null>(urlInquiry);
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [consultTypeFilters, setConsultTypeFilters] = useState<string[]>([]);
  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCurrentUserName(String((d as { user?: { name?: string } })?.user?.name ?? '').trim()))
      .catch(() => {});
  }, []);

  const clientManagerById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of getPortalClients()) {
      m.set(c.id, c.manager?.trim() ?? '');
    }
    return m;
  }, [inquiries, processes]);

  const clientRefs = useMemo<ClientNameRef[]>(() => {
    const byId = new Map<string, string>();
    for (const c of getPortalClients()) {
      byId.set(c.id, c.companyName);
    }
    for (const inq of inquiries) {
      if (inq.clientId && inq.companyName.trim()) {
        byId.set(inq.clientId, inq.companyName);
      }
    }
    for (const proc of processes) {
      if (proc.clientId && proc.companyName.trim()) {
        byId.set(proc.clientId, proc.companyName);
      }
    }
    return [...byId.entries()].map(([id, companyName]) => ({ id, companyName }));
  }, [inquiries, processes]);

  useEffect(() => { setSearch(urlQ); }, [urlQ]);
  useEffect(() => {
    if (urlInquiry) {
      setSelectedId(urlInquiry);
      return;
    }
    if (!inquiries.length && !processes.length) return;

    if (urlProcessId) {
      const process = processes.find(p => p.id === urlProcessId);
      if (process) {
        const match = findInquiryForProcess(process, inquiries, [], clientRefs);
        if (match) {
          setSelectedId(match.id);
        }
      }
      return;
    }

    if (urlQ) {
      const qKey = normalizeCompanyKey(urlQ);
      const match = inquiries.find(inq => {
        const keys = companyMatchKeys(inq.companyName);
        return keys.includes(qKey) || normalizeCompanyKey(inq.companyName) === qKey;
      });
      if (match) setSelectedId(match.id);
    }
  }, [urlInquiry, urlProcessId, urlQ, inquiries, processes, clientRefs]);

  const load = useCallback(async () => {
    const hasCache = getPortalInquiries().length > 0 || getPortalProcesses().length > 0;
    if (!hasCache) setListLoading(true);

    try {
      const [iRes, pRes] = await Promise.all([
        fetch('/api/intake/inquiries', { credentials: 'same-origin' }),
        fetch('/api/intake/processes', { credentials: 'same-origin' }),
      ]);

      let inqRaw = getPortalInquiries();
      let procRaw = getPortalProcesses();

      if (iRes.ok) {
        const d = (await iRes.json()) as { items?: Record<string, unknown>[] };
        inqRaw = d.items ?? [];
      }
      if (pRes.ok) {
        const d = (await pRes.json()) as { items?: Record<string, unknown>[] };
        procRaw = d.items ?? [];
      }

      if (inqRaw.length > 0 || procRaw.length > 0) {
        patchPortalIntake(inqRaw, procRaw);
      }

      setInquiries(inqRaw.map(r => normalizeInquiry(r)));
      setProcesses(procRaw.map(r => normalizeProcess(r)));
    } catch {
      if (!hasCache) {
        setInquiries([]);
        setProcesses([]);
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!listLoading) return;
    const timer = window.setTimeout(() => setListLoading(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [listLoading]);

  useEffect(() => {
    return subscribePortal(() => {
      setInquiries(getPortalInquiries().map(r => normalizeInquiry(r)));
      setProcesses(getPortalProcesses().map(r => normalizeProcess(r)));
    });
  }, []);

  useEffect(() => {
    if (!urlInquiry) return;
    if (inquiries.some(i => i.id === urlInquiry)) return;
    let cancelled = false;
    void fetch(`/api/intake/inquiries/${urlInquiry}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.inquiry) return;
        const row = normalizeInquiry(data.inquiry as Record<string, unknown>);
        setInquiries(prev => (prev.some(i => i.id === row.id) ? prev : [...prev, row]));
      });
    return () => { cancelled = true; };
  }, [urlInquiry, inquiries]);

  const filterText = search.trim().toLowerCase();

  const inquiryMatchesMine = useCallback(
    (inq: InquiryRow) => {
      if (!currentUserName) return true;
      const names = getManagerMatchNames(currentUserName);
      if (names.includes(inq.consultant?.trim() ?? '')) return true;
      if (inq.clientId) {
        const mgr = clientManagerById.get(inq.clientId);
        if (mgr && names.includes(mgr)) return true;
      }
      const proc = findProcessForInquiry(inq, processes, clientRefs);
      if (proc?.clientId) {
        const mgr = clientManagerById.get(proc.clientId);
        if (mgr && names.includes(mgr)) return true;
      }
      return false;
    },
    [currentUserName, clientManagerById, processes, clientRefs],
  );

  const filterFn = (list: InquiryRow[]) => {
    let out = list;
    if (scope === 'mine') out = out.filter(inquiryMatchesMine);
    if (consultTypeFilters.length > 0) {
      out = out.filter(inquiry => {
        const selected = inquiryConsultTypes(inquiry.extra);
        return consultTypeFilters.some(type => selected.includes(type));
      });
    }
    if (!filterText) return out;
    return out.filter(i => i.companyName.toLowerCase().includes(filterText));
  };

  const pinInquiryId = urlInquiry || selectedId;

  const filteredInquiries = useMemo(() => {
    const base = sortInquiries(filterFn(inquiries), sort);
    if (!pinInquiryId) return base;
    if (base.some(i => i.id === pinInquiryId)) return base;
    const pinned = inquiries.find(i => i.id === pinInquiryId);
    if (!pinned) return base;
    return sortInquiries([pinned, ...base], sort);
  }, [inquiries, filterText, sort, pinInquiryId, scope, inquiryMatchesMine, consultTypeFilters]);
  const filteredProcesses = useMemo(
    () => {
      let list = processes;
      if (consultTypeFilters.length > 0) {
        const matchedInquiryIds = new Set(
          inquiries
            .filter(inquiry => {
              const selected = inquiryConsultTypes(inquiry.extra);
              return consultTypeFilters.some(type => selected.includes(type));
            })
            .map(inquiry => inquiry.id),
        );
        list = list.filter(p => {
          const inq = findInquiryForProcess(p, inquiries, [], clientRefs);
          return inq ? matchedInquiryIds.has(inq.id) : false;
        });
      }
      if (scope === 'mine') {
        const mineInquiryIds = new Set(inquiries.filter(inquiryMatchesMine).map(i => i.id));
        list = list.filter(p => {
          const inq = findInquiryForProcess(p, inquiries, [], clientRefs);
          if (inq && mineInquiryIds.has(inq.id)) return true;
          if (p.clientId) {
            const mgr = clientManagerById.get(p.clientId);
            return mgr ? getManagerMatchNames(currentUserName).includes(mgr) : false;
          }
          return false;
        });
      }
      return sortProcesses(
        filterText ? list.filter(x => x.companyName.toLowerCase().includes(filterText)) : list,
        sort,
      );
    },
    [processes, inquiries, filterText, sort, scope, inquiryMatchesMine, clientRefs, clientManagerById, currentUserName, consultTypeFilters],
  );

  const onInquiryUpdated = useCallback((row: InquiryRow) => {
    setInquiries(prev => prev.map(q => (q.id === row.id ? row : q)));
    patchPortalInquiry(row.id, row as unknown as Record<string, unknown>);
  }, []);

  const onProcessUpdated = useCallback((row: ProcessRow) => {
    setProcesses(prev => prev.map(p => p.id === row.id ? row : p));
  }, []);

  const onProcessCreated = useCallback((row: ProcessRow) => {
    setProcesses(prev => [row, ...prev]);
  }, []);

  const syncChecklistToPortal = useCallback((row: ProcessRow) => {
    patchPortalProcess(row.id, row as unknown as Record<string, unknown>);
  }, []);

  const toggleCheck = useCallback(async (process: ProcessRow, key: string) => {
    const prevChecklist = { ...process.checklist };
    const next = { ...process.checklist, [key]: !process.checklist?.[key] };
    const optimistic = { ...process, checklist: next };
    onProcessUpdated(optimistic);
    syncChecklistToPortal(optimistic);

    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: next, toggledKey: key as ChecklistKey }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      const saved = normalizeProcess(data.process as Record<string, unknown>);
      onProcessUpdated(saved);
      syncChecklistToPortal(saved);
    } catch {
      onProcessUpdated({ ...process, checklist: prevChecklist });
      syncChecklistToPortal({ ...process, checklist: prevChecklist });
    }
  }, [onProcessUpdated, syncChecklistToPortal]);

  const hideChecklistItem = useCallback(async (process: ProcessRow, key: string) => {
    const prevChecklist = { ...process.checklist };
    const prevHidden = Array.isArray(process.checklist?._hidden)
      ? (process.checklist._hidden as string[])
      : [];
    const hidden = [...new Set([...prevHidden, key])];
    const next = { ...process.checklist, _hidden: hidden };
    const optimistic = { ...process, checklist: next };
    onProcessUpdated(optimistic);
    syncChecklistToPortal(optimistic);

    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: { _hidden: hidden } }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      const saved = normalizeProcess(data.process as Record<string, unknown>);
      onProcessUpdated(saved);
      syncChecklistToPortal(saved);
    } catch {
      onProcessUpdated({ ...process, checklist: prevChecklist });
      syncChecklistToPortal({ ...process, checklist: prevChecklist });
    }
  }, [onProcessUpdated, syncChecklistToPortal]);

  const restoreChecklist = useCallback(async (process: ProcessRow) => {
    const prevChecklist = { ...process.checklist };
    const next = { ...process.checklist, _hidden: [] };
    const optimistic = { ...process, checklist: next };
    onProcessUpdated(optimistic);
    syncChecklistToPortal(optimistic);

    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: { _hidden: [] } }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      const saved = normalizeProcess(data.process as Record<string, unknown>);
      onProcessUpdated(saved);
      syncChecklistToPortal(saved);
    } catch {
      onProcessUpdated({ ...process, checklist: prevChecklist });
      syncChecklistToPortal({ ...process, checklist: prevChecklist });
    }
  }, [onProcessUpdated, syncChecklistToPortal]);

  const syncBlueholeCheck = useCallback(async (process: ProcessRow) => {
    if (process.checklist?.blueholeClient) return;
    const prevChecklist = { ...process.checklist };
    const next = { ...process.checklist, blueholeClient: true };
    const optimistic = { ...process, checklist: next };
    onProcessUpdated(optimistic);
    syncChecklistToPortal(optimistic);

    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: next, toggledKey: 'blueholeClient' as ChecklistKey }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      const saved = normalizeProcess(data.process as Record<string, unknown>);
      onProcessUpdated(saved);
      syncChecklistToPortal(saved);
    } catch {
      onProcessUpdated({ ...process, checklist: prevChecklist });
      syncChecklistToPortal({ ...process, checklist: prevChecklist });
    }
  }, [onProcessUpdated, syncChecklistToPortal]);

  const registerClient = useCallback(async (inquiryId: string, processId: string | null): Promise<string | null> => {
    const res = await fetch('/api/intake/register-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryId, processId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '수임처 등록 실패');
    const clientId = String(data.client.id);
    setInquiries(prev => prev.map(q => (q.id === inquiryId ? { ...q, clientId } : q)));
    if (processId) {
      setProcesses(prev => prev.map(p => (p.id === processId ? { ...p, clientId } : p)));
    }
    return clientId;
  }, []);

  const linkClient = useCallback(async (inquiryId: string, processId: string | null, clientId: string) => {
    const res = await fetch('/api/intake/link-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryId, processId, clientId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '연결 실패');
    if (data.inquiry) {
      const row = normalizeInquiry(data.inquiry as Record<string, unknown>);
      setInquiries(prev => prev.map(q => (q.id === inquiryId ? row : q)));
    }
    if (data.process && processId) {
      const proc = normalizeProcess(data.process as Record<string, unknown>);
      setProcesses(prev => prev.map(p => (p.id === processId ? proc : p)));
    }
  }, []);

  const onSearchChange = (v: string) => {
    setSearch(v);
    const p = new URLSearchParams(searchParams.toString());
    if (v.trim()) p.set('q', v.trim()); else p.delete('q');
    router.replace(`/clients/intake?${p.toString()}`, { scroll: false });
  };

  const onSortChange = (v: IntakeSort) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('sort', v);
    router.replace(`/clients/intake?${p.toString()}`, { scroll: false });
  };

  const onSelectInquiry = (id: string | null) => {
    setSelectedId(id);
    const p = new URLSearchParams(searchParams.toString());
    if (id) p.set('inquiry', id); else p.delete('inquiry');
    router.replace(`/clients/intake?${p.toString()}`, { scroll: false });
  };

  const deleteInquiry = async (inquiry: InquiryRow, process: ProcessRow | null) => {
    const label = inquiry.companyName.trim() || '(미입력)';
    const linked = process ?? findProcessForInquiry(inquiry, processes, clientRefs);
    const clientNote = inquiry.clientId
      ? '\n\n등록된 수임처는 유지되며, 유입 목록에서만 삭제됩니다.'
      : '';
    if (!confirm(`"${label}" 유입 건을 삭제할까요?${linked ? '\n연결된 유입프로세스도 함께 삭제됩니다.' : ''}${clientNote}`)) {
      return;
    }
    setDeletingId(inquiry.id);
    try {
      const res = await fetch(`/api/intake/inquiries/${inquiry.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processId: linked?.id ?? null }),
      });
      if (!res.ok) throw new Error('삭제 실패');
      setInquiries(prev => prev.filter(q => q.id !== inquiry.id));
      if (linked) {
        setProcesses(prev => prev.filter(p => p.id !== linked.id));
      }
      if (selectedId === inquiry.id) onSelectInquiry(null);
    } catch {
      alert('삭제하지 못했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedInquiry = filteredInquiries.find(i => i.id === selectedId);

  return (
    <PortalPageShell>
      <IntakeTabs active={tab} />

      {tab !== 'consultation' && (
        <IntakeToolbar
          search={search}
          sort={sort}
          scope={scope}
          consultTypeFilters={consultTypeFilters}
          onSearchChange={onSearchChange}
          onSortChange={onSortChange}
          onScopeChange={setScope}
          onToggleConsultType={type =>
            setConsultTypeFilters(prev =>
              prev.includes(type) ? prev.filter(v => v !== type) : [...prev, type],
            )
          }
        />
      )}

      {tab === 'consultation' ? (
        <ConsultationFormPanel
          key={draftId ?? 'new'}
          initialDraftId={draftId}
          onSuccess={({ inquiryId, processId }) => {
            void load();
            router.push(buildIntakeDeepLink({ inquiryId, processId }));
          }}
        />
      ) : listLoading ? (
        <p className="portal-meta py-12 text-center">유입·유입프로세스를 불러오는 중…</p>
      ) : (
        <IntakeSplitView
          inquiries={filteredInquiries}
          processes={processes}
          selectedId={selectedId}
          forcedProcessId={urlProcessId}
          clientRefs={clientRefs}
          onSelect={onSelectInquiry}
          onInquiryUpdated={onInquiryUpdated}
          onProcessUpdated={onProcessUpdated}
          onProcessCreated={onProcessCreated}
          onToggleCheck={toggleCheck}
          onSyncBlueholeCheck={syncBlueholeCheck}
          onHideChecklistItem={hideChecklistItem}
          onRestoreChecklist={restoreChecklist}
          onRegisterClient={registerClient}
          onLinkClient={linkClient}
          onDeleteInquiry={deleteInquiry}
          deletingId={deletingId}
        />
      )}

      {tab !== 'consultation' && (
        <p className={portalFooterMeta}>
          유입관리 {filteredInquiries.length}건 · 유입프로세스 {filteredProcesses.length}건
          {selectedInquiry && <span> · 선택: {selectedInquiry.companyName || '(미입력)'}</span>}
        </p>
      )}
    </PortalPageShell>
  );
}
