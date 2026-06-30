'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalInput,
} from '@/app/components/portal/uiClasses';

type Row = {
  id: string;
  companyName: string;
  manager: string;
  representative: string;
  businessNo: string;
  businessEntityType: string;
  status: 'active' | 'churned';
};

type BhCandidate = { id: string; name: string; business_number: string; branch_name: string };

type StatusFilter = 'active' | 'churned' | 'all';

const ENTITY_LABEL: Record<string, string> = {
  corporate: '법인',
  individual: '개인',
  nonBusiness: '비사업자',
};

type BhSearchItem = {
  id: string;
  name: string;
  aka?: string;
  business_number?: string;
  branch_name?: string;
  manager_name?: string;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** 미연결 1건 — 인라인 검색·연결 */
function LinkRow({
  row,
  initialCandidates,
  onLinked,
}: {
  row: Row;
  initialCandidates?: BhCandidate[];
  onLinked: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(row.companyName || '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BhSearchItem[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const normalizedBiz = (row.businessNo || '').replace(/\D/g, '');

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError('');
    setResults(null);
    try {
      const res = await fetch(`/api/bluehole/clients?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '검색 실패');
      setResults((data.clients as BhSearchItem[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색 실패');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const link = useCallback(
    async (bhId: string) => {
      if (!bhId) return;
      setBusyId(bhId);
      setError('');
      try {
        const res = await fetch(`/api/clients/${row.id}/bluehole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueholeClientId: bhId }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error((data.error as string) || '연결 실패');
        onLinked(row.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : '연결 실패');
      } finally {
        setBusyId('');
      }
    },
    [row.id, onLinked],
  );

  const candidates = initialCandidates ?? [];

  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/clients/${row.id}`}
              className="font-medium text-slate-900 hover:text-blue-700 hover:underline truncate"
            >
              {row.companyName}
            </Link>
            {row.status === 'churned' && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">해임</span>
            )}
            {ENTITY_LABEL[row.businessEntityType] && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {ENTITY_LABEL[row.businessEntityType]}
              </span>
            )}
            {candidates.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                후보 {candidates.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {row.manager && `${row.manager} · `}
            {row.representative && `대표 ${row.representative} · `}
            {row.businessNo || '사업자번호 없음'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${portalBtnSecondary} shrink-0`}
        >
          {open ? '닫기' : '연결'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          {candidates.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-amber-700">자동 매칭 후보</p>
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-amber-100 bg-white">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {[c.business_number, c.branch_name].filter(Boolean).join(' · ') || '정보 없음'}
                      </p>
                    </div>
                    <button type="button" onClick={() => link(c.id)} disabled={!!busyId} className={portalBtnPrimary}>
                      {busyId === c.id ? '연결 중…' : '연결'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch();
              }}
              placeholder="상호 또는 블루홀 거래처 ID/주소"
              className={`${portalInput} flex-1`}
            />
            <button type="button" onClick={() => void runSearch()} disabled={searching || !query.trim()} className={portalBtnPrimary}>
              {searching ? '검색 중…' : '검색'}
            </button>
          </div>

          {(/^\d+$/.test(query.trim()) || query.includes('client/info/')) && (
            <button type="button" onClick={() => link(query.trim())} disabled={!!busyId} className={portalBtnSecondary}>
              이 ID/주소로 바로 연결
            </button>
          )}

          {error && <div className={portalAlertError}>{error}</div>}

          {results && (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 bg-white">
              {results.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-gray-400">검색 결과가 없습니다.</li>
              ) : (
                results.map((c) => {
                  const bizMatch =
                    normalizedBiz && (c.business_number || '').replace(/\D/g, '') === normalizedBiz;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {c.name}
                          {c.aka ? <span className="ml-1 font-normal text-gray-400">({c.aka})</span> : null}
                          {bizMatch && (
                            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                              사업자번호 일치
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {[c.business_number, c.manager_name, c.branch_name].filter(Boolean).join(' · ') || '정보 없음'}
                        </p>
                      </div>
                      <button type="button" onClick={() => link(c.id)} disabled={!!busyId} className={portalBtnSecondary}>
                        {busyId === c.id ? '연결 중…' : '연결'}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function BlueholeUnlinkedAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [candidatesById, setCandidatesById] = useState<Record<string, BhCandidate[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/bluehole-unlinked', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '목록을 불러오지 못했습니다.');
      }
      const data = await res.json();
      setRows(data.clients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAutoLink = useCallback(async () => {
    if (!confirm('블루홀 거래처와 자동 연결을 시도할까요?\n사업자번호·상호가 정확히 일치하는 건만 자동 연결되고, 나머지는 후보와 함께 아래 목록에 남습니다.')) {
      return;
    }
    setAutoBusy(true);
    setAutoMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/bluehole-unlinked/auto-link', { method: 'POST' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '자동 연결 실패');
      const linked = (data.linked as unknown[]) || [];
      const remaining = (data.remaining as Array<{ id: string; candidates: BhCandidate[] }>) || [];
      const cand: Record<string, BhCandidate[]> = {};
      for (const r of remaining) if (r.candidates?.length) cand[r.id] = r.candidates;
      setCandidatesById(cand);
      const withCand = remaining.filter((r) => r.candidates?.length).length;
      setAutoMsg(
        `자동 연결 ${linked.length}건 완료 · 미연결 ${remaining.length}건 남음` +
          (withCand > 0 ? ` (그중 ${withCand}건은 후보 있음)` : ''),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '자동 연결 실패');
    } finally {
      setAutoBusy(false);
    }
  }, [load]);

  const onLinked = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setCandidatesById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!text) return true;
      return (
        r.companyName.toLowerCase().includes(text) ||
        r.manager.toLowerCase().includes(text) ||
        r.representative.toLowerCase().includes(text) ||
        r.businessNo.replace(/\D/g, '').includes(text.replace(/\D/g, ''))
      );
    });
  }, [rows, q, statusFilter]);

  const activeCount = useMemo(() => rows.filter((r) => r.status === 'active').length, [rows]);
  const churnedCount = rows.length - activeCount;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-gray-900">블루홀 미연결 수임처</h1>
        <p className="mt-1 text-sm text-gray-500">
          블루홀 거래처와 아직 연결되지 않은 수임처입니다. <b>자동 연결</b>을 먼저 실행하면 사업자번호·상호가 일치하는 건이
          연결되고, 남은 업체는 아래에서 직접 검색·연결할 수 있습니다.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runAutoLink()} disabled={autoBusy || loading} className={portalBtnPrimary}>
            {autoBusy ? '자동 연결 중…' : '자동 연결 실행'}
          </button>
          {autoMsg && (
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
              {autoMsg}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="상호·담당·대표자·사업자번호 검색…"
            className={`${portalInput} flex-1 min-w-[12rem]`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={portalInput}
            aria-label="상태 필터"
          >
            <option value="active">수임 중 ({activeCount})</option>
            <option value="churned">해임 ({churnedCount})</option>
            <option value="all">전체 ({rows.length})</option>
          </select>
          <button type="button" onClick={() => void load()} className={portalBtnSecondary}>
            새로고침
          </button>
        </div>

        {error && <div className={`${portalAlertError} mt-4`}>{error}</div>}

        <div className={`${portalCard} mt-4 overflow-hidden`}>
          {loading ? (
            <p className="p-6 text-sm text-slate-500 text-center">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <div className={portalEmptyState}>
              {rows.length === 0 ? '미연결 수임처가 없습니다.' : '조건에 맞는 업체가 없습니다.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <LinkRow key={r.id} row={r} initialCandidates={candidatesById[r.id]} onLinked={onLinked} />
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">총 {filtered.length}건 표시.</p>
      </main>
    </div>
  );
}
