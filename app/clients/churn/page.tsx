'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AppHeader from '../../components/AppHeader';
import ChurnHistoryTable from '../../components/churn/ChurnHistoryTable';
import ChurnRecordPanel from '../../components/churn/ChurnRecordPanel';
import ChurnRegisterForm, {
  defaultChurnFormValues,
  type ChurnFormValues,
} from '../../components/churn/ChurnRegisterForm';
import type { ClientRecord, ChurnRecordView } from '../../types/client';

function ChurnPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'register' | 'history'>(
    searchParams.get('tab') === 'history' ? 'history' : 'register',
  );
  const [history, setHistory] = useState<ChurnRecordView[]>([]);
  const [missingClients, setMissingClients] = useState<ClientRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ChurnFormValues>(defaultChurnFormValues);
  const [backfillNote, setBackfillNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const historyRes = await fetch('/api/churn');
      const historyData = await historyRes.json();
      if (!historyRes.ok) throw new Error(historyData.error ?? '이력을 불러오지 못했습니다.');
      setHistory(historyData.records ?? []);
      setMissingClients(historyData.missingClients ?? []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '이력을 불러오지 못했습니다.');
      setHistory([]);
      setMissingClients([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
      setBackfillNote(true);
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
          setBackfillNote(data.client.status === 'churned');
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

  const handleFormChange = (patch: Partial<ChurnFormValues>) => {
    setFormValues(v => ({ ...v, ...patch }));
  };

  const handleClientChange = (client: ClientRecord | null) => {
    setSelectedClient(client);
    setBackfillNote(client?.status === 'churned');
    if (client?.feeSummary != null) {
      setFormValues(v => ({ ...v, feeAmount: String(client.feeSummary) }));
    }
  };

  const handleSubmit = async () => {
    if (!selectedClient) {
      setError('수임처를 검색해 선택해 주세요.');
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
      setBackfillNote(false);
      setTab('history');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleMissingClick = (client: ClientRecord) => {
    setTab('register');
    setSelectedClient(client);
    setBackfillNote(true);
    if (client.feeSummary != null) {
      setFormValues(v => ({ ...v, feeAmount: String(client.feeSummary) }));
    }
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
      await loadHistory();
    } catch {
      alert('삭제하지 못했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-black text-gray-900">유출 관리</h1>
        <p className="text-sm text-gray-600 mt-1">유출 등록 · Excel 유출 시트 이력</p>

        <div className="mt-4 flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab('register')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === 'register' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}
          >
            유출 등록
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('history');
              void loadHistory();
            }}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}
          >
            유출 이력 ({history.length})
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {tab === 'register' ? (
          <ChurnRegisterForm
            selectedClient={selectedClient}
            onClientChange={handleClientChange}
            values={formValues}
            onChange={handleFormChange}
            saving={saving}
            onSubmit={() => void handleSubmit()}
            backfillNote={backfillNote}
          />
        ) : (
          <div className="mt-6 space-y-6">
            {historyError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {historyError}
              </div>
            )}

            {historyLoading ? (
              <p className="text-sm text-gray-400">유출 이력 불러오는 중…</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4 items-start">
                <ChurnHistoryTable
                  records={history}
                  selectedId={selectedRecordId}
                  onSelect={setSelectedRecordId}
                />
                <div className="xl:sticky xl:top-[8.75rem]">
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
              <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <h2 className="text-sm font-black text-amber-900">
                  유출 이력 없음 ({missingClients.length}건)
                </h2>
                <p className="text-xs text-amber-800 mt-1">
                  유출 상태이지만 이력이 없는 수임처입니다. 클릭하면 등록 폼으로 이동합니다.
                </p>
                <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {missingClients.map(client => (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => handleMissingClick(client)}
                        className="w-full text-left rounded-xl border border-amber-200 bg-white px-3 py-2 hover:bg-amber-50 transition-colors"
                      >
                        <span className="text-sm font-bold text-gray-900">{client.companyName}</span>
                        <span className="text-xs text-gray-500 ml-2">{client.manager}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ChurnPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-400">불러오는 중…</p>}>
      <ChurnPageInner />
    </Suspense>
  );
}
