'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '../../components/AppHeader';
import IntakeTabs, { resolveIntakeTab } from '../../components/intake/IntakeTabs';
import ConsultationFormPanel from '../../components/intake/ConsultationFormPanel';
import IntakeSplitView from '../../components/intake/IntakeSplitView';
import {
  sortInquiries,
  sortProcesses,
  type InquiryRow,
  type IntakeSort,
  type ProcessRow,
} from '../../components/intake/intakeUtils';

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
    inquiryDate: String(pick(raw, 'inquiryDate', 'inquiry_date') ?? ''),
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
  };
}

function normalizeProcess(raw: Record<string, unknown>): ProcessRow {
  const updated = pick(raw, 'updatedAt', 'updated_at');
  return {
    id: String(pick(raw, 'id') ?? ''),
    clientId: pick(raw, 'clientId', 'client_id') != null ? String(pick(raw, 'clientId', 'client_id')) : null,
    companyName: String(pick(raw, 'companyName', 'company_name') ?? ''),
    feeStartDate: String(pick(raw, 'feeStartDate', 'fee_start_date') ?? ''),
    monthlyFee: typeof pick(raw, 'monthlyFee', 'monthly_fee') === 'number'
      ? (pick(raw, 'monthlyFee', 'monthly_fee') as number)
      : null,
    channel: String(pick(raw, 'channel') ?? ''),
    checklist: (pick(raw, 'checklist') && typeof pick(raw, 'checklist') === 'object'
      ? pick(raw, 'checklist')
      : {}) as Record<string, boolean>,
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
        <option value="created">최신순</option>
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
  const urlQ = searchParams.get('q')?.trim() ?? '';

  const urlSort = searchParams.get('sort');
  const sort: IntakeSort = urlSort === 'name' ? 'name' : 'created';

  const [search, setSearch] = useState(urlQ);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { setSearch(urlQ); }, [urlQ]);

  const load = useCallback(async () => {
    setLoading(true);
    const [inqRes, procRes] = await Promise.all([
      fetch('/api/intake/inquiries'),
      fetch('/api/intake/processes'),
    ]);
    const [inqData, procData] = await Promise.all([inqRes.json(), procRes.json()]);
    setInquiries((inqData.items ?? []).map((r: Record<string, unknown>) => normalizeInquiry(r)));
    setProcesses((procData.items ?? []).map((r: Record<string, unknown>) => normalizeProcess(r)));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filterText = search.trim().toLowerCase();
  const filterFn = <T extends { companyName: string }>(list: T[]) =>
    filterText ? list.filter(x => x.companyName.toLowerCase().includes(filterText)) : list;

  const filteredInquiries = useMemo(
    () => sortInquiries(filterFn(inquiries), sort),
    [inquiries, filterText, sort],
  );
  const filteredProcesses = useMemo(
    () => sortProcesses(filterFn(processes), sort),
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

  const toggleCheck = async (process: ProcessRow, key: string) => {
    const next = { ...process.checklist, [key]: !process.checklist?.[key] };
    setSavingId(process.id);
    try {
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: next }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      onProcessUpdated(normalizeProcess(data.process));
    } finally {
      setSavingId(null);
    }
  };

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

        {loading ? (
          <p className="text-sm text-gray-400 py-12 text-center">불러오는 중…</p>
        ) : tab === 'consultation' ? (
          <ConsultationFormPanel
            key={draftId ?? 'new'}
            initialDraftId={draftId}
            onSuccess={() => { void load(); router.push('/clients/intake?tab=intake'); }}
          />
        ) : (
          <IntakeSplitView
            inquiries={filteredInquiries}
            processes={processes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onInquiryUpdated={onInquiryUpdated}
            onProcessUpdated={onProcessUpdated}
            onProcessCreated={onProcessCreated}
            onToggleCheck={toggleCheck}
            onRegisterClient={registerClient}
            savingId={savingId}
          />
        )}

        {!loading && tab !== 'consultation' && (
          <p className="mt-4 text-xs text-gray-400 text-center">
            유입관리 {filteredInquiries.length}건 · 유입프로세스 {filteredProcesses.length}건
            {selectedInquiry && <span> · 선택: {selectedInquiry.companyName || '(미입력)'}</span>}
          </p>
        )}
      </main>
    </div>
  );
}
