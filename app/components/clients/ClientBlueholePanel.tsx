'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  portalInput,
  portalBtnPrimary,
  portalBtnSecondary,
  portalBtnDanger,
  portalAlertError,
  portalAlertInfo,
} from '../portal/uiClasses';

interface BhSearchItem {
  id: string;
  name: string;
  aka?: string;
  business_number?: string;
  branch_name?: string;
  manager_name?: string;
}

interface BhInfo {
  id: string;
  name?: string;
  business_number?: string;
  manager?: string;
  branch?: string;
  updated_at?: string;
}

interface LinkState {
  blueholeClientId: string;
  linked: boolean;
  configured: boolean;
  info?: BhInfo | null;
  infoError?: string;
  deeplink?: string;
}

const deeplinkOf = (bhId: string) => `https://bluehole.world/client/info/${bhId}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function ClientBlueholePanel({
  clientId,
  companyName,
  businessNumber,
  canEdit,
}: {
  clientId: string;
  companyName: string;
  businessNumber?: string;
  canEdit: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<LinkState | null>(null);
  const [error, setError] = useState('');

  const [query, setQuery] = useState(companyName || '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BhSearchItem[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [unlinking, setUnlinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '상태를 불러오지 못했습니다.');
      setState(data as unknown as LinkState);
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    setResults(null);
    try {
      const res = await fetch(`/api/bluehole/clients?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '검색 실패');
      setResults((data.clients as BhSearchItem[]) || []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '검색 실패');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const link = useCallback(
    async (bhId: string) => {
      if (!bhId) return;
      setBusyId(bhId);
      setSearchError('');
      try {
        const res = await fetch(`/api/clients/${clientId}/bluehole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueholeClientId: bhId }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error((data.error as string) || '연결 실패');
        setState(data as unknown as LinkState);
        setResults(null);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : '연결 실패');
      } finally {
        setBusyId('');
      }
    },
    [clientId],
  );

  const unlink = useCallback(async () => {
    if (!confirm('블루홀 거래처 연결을 해제할까요? (블루홀 데이터는 삭제되지 않습니다)')) return;
    setUnlinking(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole`, { method: 'DELETE' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '해제 실패');
      setState({ blueholeClientId: '', linked: false, configured: state?.configured ?? true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setUnlinking(false);
    }
  }, [clientId, state?.configured]);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500">블루홀 거래처</p>
        {state?.linked && (
          <a
            href={state.deeplink || deeplinkOf(state.blueholeClientId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            블루홀에서 열기 ↗
          </a>
        )}
      </div>

      {loading ? (
        <p className="py-2 text-sm text-gray-400">불러오는 중…</p>
      ) : error ? (
        <div className={portalAlertError}>{error}</div>
      ) : state?.linked ? (
        <LinkedView
          state={state}
          canEdit={canEdit}
          unlinking={unlinking}
          onUnlink={unlink}
        />
      ) : !canEdit ? (
        <p className="py-1 text-sm text-gray-400">블루홀 미연결</p>
      ) : state && !state.configured ? (
        <div className={portalAlertInfo}>
          블루홀 계정이 등록되어 있지 않습니다.{' '}
          <Link href="/bluehole" className="font-semibold underline">
            블루홀 페이지
          </Link>
          에서 먼저 계정을 등록하세요.
        </div>
      ) : (
        <UnlinkedSearch
          query={query}
          setQuery={setQuery}
          searching={searching}
          results={results}
          searchError={searchError}
          businessNumber={businessNumber}
          busyId={busyId}
          onSearch={runSearch}
          onLink={link}
        />
      )}
    </div>
  );
}

function LinkedView({
  state,
  canEdit,
  unlinking,
  onUnlink,
}: {
  state: LinkState;
  canEdit: boolean;
  unlinking: boolean;
  onUnlink: () => void;
}) {
  const info = state.info;
  return (
    <div className="space-y-2">
      {info ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-gray-500">거래처명</dt>
          <dd className="font-semibold text-gray-900">{info.name || '—'}</dd>
          {info.business_number ? (
            <>
              <dt className="text-gray-500">사업자번호</dt>
              <dd className="tabular-nums text-gray-800">{info.business_number}</dd>
            </>
          ) : null}
          {info.manager ? (
            <>
              <dt className="text-gray-500">담당</dt>
              <dd className="text-gray-800">{info.manager}</dd>
            </>
          ) : null}
          {info.branch ? (
            <>
              <dt className="text-gray-500">지점</dt>
              <dd className="text-gray-800">{info.branch}</dd>
            </>
          ) : null}
        </dl>
      ) : state.infoError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          연결됨 (ID {state.blueholeClientId}). 정보 조회 실패: {state.infoError}
        </div>
      ) : (
        <p className="text-sm text-gray-600">연결됨 (ID {state.blueholeClientId})</p>
      )}

      {canEdit && (
        <div className="pt-1">
          <button type="button" onClick={onUnlink} disabled={unlinking} className={portalBtnDanger}>
            {unlinking ? '해제 중…' : '연결 해제'}
          </button>
        </div>
      )}
    </div>
  );
}

function UnlinkedSearch({
  query,
  setQuery,
  searching,
  results,
  searchError,
  businessNumber,
  busyId,
  onSearch,
  onLink,
}: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  results: BhSearchItem[] | null;
  searchError: string;
  businessNumber?: string;
  busyId: string;
  onSearch: () => void;
  onLink: (bhId: string) => void;
}) {
  const normalizedBiz = (businessNumber || '').replace(/\D/g, '');
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch();
          }}
          placeholder="상호 또는 블루홀 거래처 ID/주소"
          className={`${portalInput} flex-1`}
        />
        <button type="button" onClick={onSearch} disabled={searching || !query.trim()} className={portalBtnPrimary}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {/^\d+$/.test(query.trim()) || query.includes('client/info/') ? (
        <button type="button" onClick={() => onLink(query.trim())} disabled={!!busyId} className={portalBtnSecondary}>
          이 ID/주소로 바로 연결
        </button>
      ) : null}

      {searchError && <div className={portalAlertError}>{searchError}</div>}

      {results && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-gray-400">검색 결과가 없습니다.</li>
          ) : (
            results.map((c) => {
              const bizMatch = normalizedBiz && (c.business_number || '').replace(/\D/g, '') === normalizedBiz;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.name}
                      {c.aka ? <span className="ml-1 font-normal text-gray-400">({c.aka})</span> : null}
                      {bizMatch ? (
                        <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          사업자번호 일치
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[c.business_number, c.manager_name, c.branch_name].filter(Boolean).join(' · ') || '정보 없음'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLink(c.id)}
                    disabled={!!busyId}
                    className={portalBtnSecondary}
                  >
                    {busyId === c.id ? '연결 중…' : '연결'}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
