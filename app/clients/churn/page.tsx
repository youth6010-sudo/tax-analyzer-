'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ChurnHistoryTable from '../../components/churn/ChurnHistoryTable';
import ChurnRecordPanel from '../../components/churn/ChurnRecordPanel';
import ChurnRegisterForm, {
  defaultChurnFormValues,
  type ChurnFormValues,
} from '../../components/churn/ChurnRegisterForm';
import PortalPageShell, { PortalPageHeader } from '../../components/portal/PortalPageShell';
import PortalTabs from '../../components/portal/PortalTabs';
import { portalAlertError, portalAlertWarning, portalCard } from '../../components/portal/uiClasses';
import type { ClientRecord, ChurnRecordView } from '../../types/client';
import {
  clientNeedsChurnBackfill,
  matchChurnRecordForClient,
} from '@/app/utils/churnMatch';
import {
  getPortalChurnMissingClients,
  getPortalChurnRecords,
  patchPortalChurn,
  refreshPortalBootstrap,
  subscribePortal,
} from '@/app/utils/portalStore';
import ScopeToggle from '@/app/components/portal/ScopeToggle';
import { portalInput } from '../../components/portal/uiClasses';

function hasChurnCache(): boolean {
  return getPortalChurnRecords().length > 0 || getPortalChurnMissingClients().length > 0;
}

function ChurnPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'register' | 'history'>(
    searchParams.get('tab') === 'history' ? 'history' : 'register',
  );
  const [history, setHistory] = useState<ChurnRecordView[]>(() => getPortalChurnRecords());
  const [missingClients, setMissingClients] = useState<ClientRecord[]>(() => getPortalChurnMissingClients());
  const [historyLoading, setHistoryLoading] = useState(() => !hasChurnCache());
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ChurnFormValues>(defaultChurnFormValues);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [historySearch, setHistorySearch] = useState('');

  const syncFromPortal = useCallback(() => {
    setHistory(getPortalChurnRecords());
    setMissingClients(getPortalChurnMissingClients());
  }, []);

  const loadHistory = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent && !hasChurnCache()) setHistoryLoading(true);
    setHistoryError(null);
    try {
      const q = scope === 'mine' ? '?mine=1' : '';
      const historyRes = await fetch(`/api/churn${q}`);
      const historyData = await historyRes.json();
      if (!historyRes.ok) throw new Error(historyData.error ?? '이력을 불러오지 못했습니다.');
      const records = historyData.records ?? [];
      const missing = historyData.missingClients ?? [];
      setHistory(records);
      setMissingClients(missing);
      patchPortalChurn(records, missing);
    } catch (err) {
      if (!hasChurnCache()) {
        setHistoryError(err instanceof Error ? err.message : '이력을 불러오지 못했습니다.');
        setHistory([]);
        setMissingClients([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [scope]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter(r => {
      const hay = [
        r.companyName,
        r.manager,
        r.reason,
        r.detail,
        r.earlySign,
        r.churnType,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [history, historySearch]);

  useEffect(() => {
    syncFromPortal();
    return subscribePortal(syncFromPortal);
  }, [syncFromPortal]);

  useEffect(() => {
    void loadHistory({ silent: hasChurnCache() });
  }, [scope, loadHistory]);

  useEffect(() => {
    if (searchParams.get('clientId') || searchParams.get('tab') === 'history') {
      setTab('history');
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab !== 'history' || history.length === 0) return;
    if (selectedRecordId && history.some(r => r.id === selectedRecordId)) return;
    const clientId = searchParams.get('clientId');
    if (clientId) {
      const match = history.find(r => r.clientId === clientId);
      if (match) {
        setSelectedRecordId(match.id);
        return;
      }
    }
    setSelectedRecordId(history[0].id);
  }, [tab, history, selectedRecordId, searchParams]);

  useEffect(() => {
    const clientId = searchParams.get('prefillClientId');
    if (!clientId) return;
    const fromMissing = missingClients.find(c => c.id === clientId);
    if (fromMissing) {
      setTab('register');
      setSelectedClient(fromMissing);
      if (fromMissing.feeSummary != null) {
        setFormValues(v => ({ ...v, feeAmount: String(fromMissing.feeSummary) }));
      }
      return;
    }
    fetch(`/api/clients/${clientId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.client) {
          setTab('register');
          setSelectedClient(data.client);
          if (data.client.feeSummary != null) {
            setFormValues(v => ({ ...v, feeAmount: String(data.client.feeSummary) }));
          }
        }
      })
      .catch(() => {});
  }, [searchParams, missingClients]);

  useEffect(() => {
    if (selectedClient?.feeSummary != null && !formValues.feeAmount) {
      setFormValues(v => ({ ...v, feeAmount: String(selectedClient.feeSummary) }));
    }
  }, [selectedClient, formValues.feeAmount]);

  const selectedRecord = useMemo(
    () => history.find(r => r.id === selectedRecordId) ?? null,
    [history, selectedRecordId],
  );

  const matchedRegisterRecord = useMemo(
    () => (selectedClient ? matchChurnRecordForClient(selectedClient, history) : null),
    [selectedClient, history],
  );

  const showBackfillNote = selectedClient
    ? clientNeedsChurnBackfill(selectedClient, history)
    : false;

  const handleFormChange = (patch: Partial<ChurnFormValues>) => {
    setFormValues(v => ({ ...v, ...patch }));
  };

  const handleClientChange = (client: ClientRecord | null) => {
    setSelectedClient(client);
    if (client?.feeSummary != null) {
      setFormValues(v => ({ ...v, feeAmount: String(client.feeSummary) }));
    }
  };

  const handleSubmit = async () => {
    if (!selectedClient) {
      setError('수임처를 검색해 선택해 주세요.');
      return;
    }
    if (matchChurnRecordForClient(selectedClient, history)) {
      setError('이미 유출 이력이 등록된 수임처입니다. 유출 이력 탭에서 확인해 주세요.');
      return;
    }
    if (!formValues.reason.trim()) {
      setError('유출 사유를 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedFee = formValues.feeAmount.trim()
        ? Number(formValues.feeAmount.replace(/,/g, ''))
        : null;
      const res = await fetch('/api/clients/churn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          reason: formValues.reason,
          detail: formValues.detail,
          churnedAt: formValues.churnedAt,
          feeAmount: parsedFee != null && !Number.isNaN(parsedFee) ? parsedFee : null,
          dataCleanup: formValues.dataCleanup,
          churnType: formValues.churnType,
          earlySign: formValues.earlySign,
          manager: formValues.manager || selectedClient.manager,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등록 실패');
      setSelectedClient(null);
      setFormValues(defaultChurnFormValues());
      setTab('history');
      await loadHistory({ silent: true });
      void refreshPortalBootstrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleMissingClick = (client: ClientRecord) => {
    setTab('register');
    setSelectedClient(client);
    if (client.feeSummary != null) {
      setFormValues(v => ({ ...v, feeAmount: String(client.feeSummary) }));
    }
  };

  const handleViewExistingRecord = () => {
    if (!matchedRegisterRecord) return;
    setTab('history');
    setSelectedRecordId(matchedRegisterRecord.id);
    void loadHistory({ silent: true });
  };

  const handleRecordSaved = (record: ChurnRecordView) => {
    setHistory(prev => prev.map(r => (r.id === record.id ? record : r)));
  };

  const handleRecordDeleted = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/churn/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      setHistory(prev => prev.filter(r => r.id !== id));
      if (selectedRecordId === id) {
        const next = history.filter(r => r.id !== id);
        setSelectedRecordId(next[0]?.id ?? null);
      }
      await loadHistory({ silent: true });
    } catch {
      alert('삭제하지 못했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PortalPageShell>
      <PortalPageHeader title="유출 관리" description="유출 등록 · Excel 유출 시트 이력" />

      <PortalTabs
        className="mb-4"
        active={tab}
        onChange={id => {
          const next = id as 'register' | 'history';
          setTab(next);
          if (next === 'history') void loadHistory({ silent: true });
        }}
        tabs={[
          { id: 'register', label: '유출 등록' },
          { id: 'history', label: '유출 이력', badge: history.length },
        ]}
      />

      {error && <div className={`${portalAlertError} mb-4`}>{error}</div>}

      {tab === 'register' ? (
        <ChurnRegisterForm
          selectedClient={selectedClient}
          onClientChange={handleClientChange}
          values={formValues}
          onChange={handleFormChange}
          saving={saving}
          onSubmit={() => void handleSubmit()}
          backfillNote={showBackfillNote}
          existingRecord={matchedRegisterRecord}
          onViewExistingRecord={handleViewExistingRecord}
        />
      ) : (
        <div className="space-y-6">
          {historyError && <div className={portalAlertError}>{historyError}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <ScopeToggle value={scope} onChange={setScope} />
            <input
              type="search"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="상호·담당·사유 검색…"
              className={`${portalInput} max-w-sm flex-1 min-w-[12rem]`}
            />
          </div>

          {historyLoading ? (
            <p className="portal-meta">유출 이력 불러오는 중…</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4 items-start">
              <ChurnHistoryTable
                records={filteredHistory}
                selectedId={selectedRecordId}
                onSelect={setSelectedRecordId}
              />
              <div className="xl:sticky xl:top-4 xl:self-start">
                <ChurnRecordPanel
                  record={selectedRecord}
                  onSaved={handleRecordSaved}
                  onDeleted={id => void handleRecordDeleted(id)}
                  deleting={deletingId === selectedRecordId}
                />
              </div>
            </div>
          )}

          {missingClients.length > 0 && (
            <section className={`${portalCard} ${portalAlertWarning} p-4`}>
              <h2 className="text-sm font-semibold text-amber-900">
                유출 이력 없음 ({missingClients.length}건)
              </h2>
              <p className="portal-meta mt-1 text-amber-800">
                유출 상태이지만 이력이 없는 수임처입니다. 클릭하면 등록 폼으로 이동합니다.
              </p>
              <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                {missingClients.map(client => (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => handleMissingClick(client)}
                      className="w-full text-left rounded-lg border border-amber-200 bg-white px-3 py-2 hover:bg-amber-50/80 transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-900">{client.companyName}</span>
                      <span className="text-xs text-slate-500 ml-2">{client.manager}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PortalPageShell>
  );
}

export default function ChurnPage() {
  return (
    <Suspense
      fallback={
        <PortalPageShell>
          <p className="portal-meta">불러오는 중…</p>
        </PortalPageShell>
      }
    >
      <ChurnPageInner />
    </Suspense>
  );
}
