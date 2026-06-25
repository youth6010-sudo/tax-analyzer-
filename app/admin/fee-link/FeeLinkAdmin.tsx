'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalInput,
  portalSectionTitle,
} from '@/app/components/portal/uiClasses';

type FeePending = {
  id: string;
  companyName: string;
  manager: string;
  feeSummary: number | null;
  sourceFile: string;
};

type ClientOption = {
  id: string;
  companyName: string;
  manager: string;
};

type OrphanRecords = {
  inquiries: { id: string; companyName: string; consultant: string; businessNo: string; inquiryDate: string }[];
  processes: { id: string; companyName: string; monthlyFee: number | null; channel: string }[];
  churns: { id: string; companyName: string; manager: string; feeAmount: number | null; churnedAt: Date | string }[];
};

function formatFee(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

function ClientSearchPicker({
  onSelect,
  placeholder,
}: {
  onSelect: (client: ClientOption) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(trimmed)}&includeChurned=1`);
        const data = await res.json();
        setOptions(
          (data.clients ?? []).slice(0, 8).map((c: { id: string; companyName: string; manager: string }) => ({
            id: c.id,
            companyName: c.companyName,
            manager: c.manager,
          })),
        );
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative min-w-[12rem] flex-1">
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder ?? 'TP 수임처 검색…'}
        className={`${portalInput} w-full text-sm`}
      />
      {loading && <p className="text-xs text-slate-400 mt-1">검색 중…</p>}
      {options.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
          {options.map(c => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                onClick={() => {
                  onSelect(c);
                  setQ('');
                  setOptions([]);
                }}
              >
                <span className="font-medium">{c.companyName}</span>
                {c.manager && <span className="text-slate-500 ml-2">{c.manager}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FeeLinkAdmin() {
  const [tab, setTab] = useState<'fees' | 'orphans'>('fees');
  const [pending, setPending] = useState<FeePending[]>([]);
  const [orphans, setOrphans] = useState<OrphanRecords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const res = await fetch('/api/admin/fee-pending');
    if (!res.ok) throw new Error('수임료 대기 목록을 불러오지 못했습니다.');
    const data = await res.json();
    setPending(data.items ?? []);
  }, []);

  const loadOrphans = useCallback(async () => {
    const res = await fetch('/api/admin/orphan-records');
    if (!res.ok) throw new Error('미연결 목록을 불러오지 못했습니다.');
    setOrphans(await res.json());
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadPending(), loadOrphans()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    }
  }, [loadPending, loadOrphans]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const linkFee = async (pendingId: string, clientId: string) => {
    setBusy(pendingId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/fee-pending/${pendingId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '연결 실패');
      }
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusy(null);
    }
  };

  const dismissFee = async (pendingId: string) => {
    if (!confirm('이 수임료 항목을 무시할까요?')) return;
    setBusy(pendingId);
    try {
      await fetch(`/api/admin/fee-pending/${pendingId}`, { method: 'DELETE' });
      await loadPending();
    } finally {
      setBusy(null);
    }
  };

  const linkOrphan = async (
    kind: 'inquiry' | 'process' | 'churn',
    recordId: string,
    clientId: string,
  ) => {
    setBusy(recordId);
    setError(null);
    const paths = {
      inquiry: `/api/admin/intake/inquiries/${recordId}/link`,
      process: `/api/intake/processes/${recordId}`,
      churn: `/api/clients/churn/${recordId}`,
    };
    try {
      const res = await fetch(paths[kind], {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '연결 실패');
      }
      await loadOrphans();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusy(null);
    }
  };

  const orphanTotal =
    (orphans?.inquiries.length ?? 0) +
    (orphans?.processes.length ?? 0) +
    (orphans?.churns.length ?? 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <Link href="/clients" className="text-sm text-blue-600 hover:underline">
            ← 수임처 관리
          </Link>
          <h1 className="text-xl font-bold text-slate-900 mt-2">수임료·연결 관리</h1>
          <p className="text-sm text-slate-500 mt-1">
            0618id 수임료 미매칭 및 유입·유출 미연결 건을 TP 수임처에 연결합니다.
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab('fees')}
            className={tab === 'fees' ? portalBtnPrimary : portalBtnSecondary}
          >
            수임료 미매칭 ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('orphans')}
            className={tab === 'orphans' ? portalBtnPrimary : portalBtnSecondary}
          >
            미연결 유입·유출 ({orphanTotal})
          </button>
          <button type="button" onClick={() => void refresh()} className={`${portalBtnSecondary} ml-auto`}>
            새로고침
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {tab === 'fees' && (
          <div className={`${portalCard} divide-y divide-slate-100`}>
            {pending.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">미매칭 수임료 없음</p>
            ) : (
              pending.map(row => (
                <div key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{row.companyName}</p>
                    <p className="text-sm text-slate-500">
                      {row.manager && `${row.manager} · `}
                      {formatFee(row.feeSummary)}
                      {row.sourceFile && ` · ${row.sourceFile}`}
                    </p>
                  </div>
                  <ClientSearchPicker onSelect={c => void linkFee(row.id, c.id)} />
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void dismissFee(row.id)}
                    className={portalBtnSecondary}
                  >
                    무시
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'orphans' && orphans && (
          <div className="space-y-6">
            {[
              { title: '유입 문의', kind: 'inquiry' as const, rows: orphans.inquiries },
              { title: '유입 프로세스', kind: 'process' as const, rows: orphans.processes },
              { title: '유출', kind: 'churn' as const, rows: orphans.churns },
            ].map(section => (
              <div key={section.title} className={portalCard}>
                <h2 className={`${portalSectionTitle} px-4 pt-4 pb-2`}>
                  {section.title} ({section.rows.length})
                </h2>
                {section.rows.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-slate-500">미연결 없음</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {section.rows.map(row => (
                      <li key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{row.companyName}</p>
                          {'consultant' in row && row.consultant && (
                            <p className="text-sm text-slate-500">{row.consultant}</p>
                          )}
                          {'manager' in row && row.manager && (
                            <p className="text-sm text-slate-500">{row.manager}</p>
                          )}
                        </div>
                        <ClientSearchPicker
                          placeholder="수임처 연결…"
                          onSelect={c => void linkOrphan(section.kind, row.id, c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
