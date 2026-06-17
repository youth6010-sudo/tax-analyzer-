'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '../../components/AppHeader';
import IntakeTabs, { resolveIntakeTab } from '../../components/intake/IntakeTabs';
import ConsultationFormPanel from '../../components/intake/ConsultationFormPanel';
import IntakeSplitView from '../../components/intake/IntakeSplitView';
import {
  buildIntakeDeepLink,
  companyMatchKeys,
  findInquiryForProcess,
  findProcessForInquiry,
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
  hydratePortal,
  prefetchPortal,
  subscribePortal,
} from '@/app/utils/portalStore';

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
  onSearchChange,
  onSortChange,
}: {
  search: string;
  sort: IntakeSort;
  onSearchChange: (v: string) => void;
  onSortChange: (v: IntakeSort) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="상호 검색…"
        className="w-full max-w-md border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
      />
      <select
        value={sort}
        onChange={e => onSortChange(e.target.value as IntakeSort)}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
        aria-label="정렬"
      >
        <option value="inquiryDate">문의일순</option>
        <option value="name">이름순</option>
      </select>
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
  const [selectedId, setSelectedId] = useState<string | null>(urlInquiry);

  const clientRefs = useMemo<ClientNameRef[]>(
    () => getPortalClients().map(c => ({ id: c.id, companyName: c.companyName })),
    [inquiries, processes],
  );

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
    await prefetchPortal(true);
    setInquiries(getPortalInquiries().map(r => normalizeInquiry(r)));
    setProcesses(getPortalProcesses().map(r => normalizeProcess(r)));
  }, []);

  useEffect(() => {
    if (!inquiries.length && !processes.length) hydratePortal();
    return subscribePortal(() => {
      setInquiries(getPortalInquiries().map(r => normalizeInquiry(r)));
      setProcesses(getPortalProcesses().map(r => normalizeProcess(r)));
    });
  }, [inquiries.length, processes.length]);

  const filterText = search.trim().toLowerCase();
  const filterFn = (list: InquiryRow[]) => {
    if (!filterText) return list;
    return list.filter(i => i.companyName.toLowerCase().includes(filterText));
  };

  const filteredInquiries = useMemo(
    () => sortInquiries(filterFn(inquiries), sort),
    [inquiries, filterText, sort],
  );
  const filteredProcesses = useMemo(
    () => sortProcesses(
      filterText
        ? processes.filter(x => x.companyName.toLowerCase().includes(filterText))
        : processes,
      sort,
    ),
    [processes, filterText, sort],
  );

  const onInquiryUpdated = useCallback((row: InquiryRow) => {
    setInquiries(prev => prev.map(q => q.id === row.id ? row : q));
  }, []);

  const onProcessUpdated = useCallback((row: ProcessRow) => {
    setProcesses(prev => prev.map(p => p.id === row.id ? row : p));
  }, []);

  const onProcessCreated = useCallback((row: ProcessRow) => {
    setProcesses(prev => [row, ...prev]);
  }, []);

  const toggleCheck = useCallback(async (process: ProcessRow, key: string) => {
    const prevChecklist = { ...process.checklist };
    const next = { ...process.checklist, [key]: !process.checklist?.[key] };
    onProcessUpdated({ ...process, checklist: next });

    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: next, toggledKey: key as ChecklistKey }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      onProcessUpdated(normalizeProcess(data.process as Record<string, unknown>));
    } catch {
      onProcessUpdated({ ...process, checklist: prevChecklist });
    }
  }, [onProcessUpdated]);

  const syncBlueholeCheck = useCallback(async (process: ProcessRow) => {
    if (process.checklist?.blueholeClient) return;
    const prevChecklist = { ...process.checklist };
    const next = { ...process.checklist, blueholeClient: true };
    onProcessUpdated({ ...process, checklist: next });

    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: next, toggledKey: 'blueholeClient' as ChecklistKey }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      onProcessUpdated(normalizeProcess(data.process as Record<string, unknown>));
    } catch {
      onProcessUpdated({ ...process, checklist: prevChecklist });
    }
  }, [onProcessUpdated]);

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
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-10 py-6">
        <IntakeTabs active={tab} />

        {tab !== 'consultation' && (
          <IntakeToolbar
            search={search}
            sort={sort}
            onSearchChange={onSearchChange}
            onSortChange={onSortChange}
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
            onRegisterClient={registerClient}
            onDeleteInquiry={deleteInquiry}
            deletingId={deletingId}
          />
        )}

        {tab !== 'consultation' && (
          <p className="mt-4 text-xs text-gray-400 text-center">
            유입관리 {filteredInquiries.length}건 · 유입프로세스 {filteredProcesses.length}건
            {selectedInquiry && <span> · 선택: {selectedInquiry.companyName || '(미입력)'}</span>}
          </p>
        )}
      </main>
    </div>
  );
}
