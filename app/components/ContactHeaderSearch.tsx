'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClientSearchResult } from '../types/client';
import ClientExpandableCard from './ClientExpandableCard';
import {
  getPortalSearchIndex,
  hydratePortal,
  prefetchSearchIndex,
  searchPortalClients,
} from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';

export default function ContactHeaderSearch({ expanded = false }: { expanded?: boolean }) {
  const router = useRouter();
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    hydratePortal();
    void prefetchSearchIndex();
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const local = getPortalSearchIndex().length > 0 ? searchPortalClients(q) : [];
    setResults(local);
    setSearching(true);

    fetch(`/api/clients/search?q=${encodeURIComponent(q)}&includeChurned=1`, {
      signal: ac.signal,
    })
      .then(r => (r.ok ? r.json() : { clients: [] }))
      .then(data => {
        const api = (data.clients ?? []) as ClientSearchResult[];
        setResults(mergeClientSearchResults(local, api));
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setResults(local);
      })
      .finally(() => {
        if (!ac.signal.aborted) setSearching(false);
      });
  }, [query]);

  const showPanel = open && query.trim().length > 0;

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  const handleSelect = useCallback((record: ClientSearchResult) => {
    setOpen(false);
    if (record.status === 'churned') {
      router.push(`/clients/churn?tab=history&clientId=${record.id}`);
      return;
    }
    router.push(`/clients/${record.id}`);
  }, [router]);

  return (
    <div
      ref={rootRef}
      className={[
        'relative flex min-w-0 items-center gap-1.5',
        expanded ? 'w-full' : 'w-full shrink-0 sm:w-auto',
      ].join(' ')}
    >
      <div className={expanded ? 'relative min-w-0 flex-1' : 'relative flex-1 sm:w-80 lg:w-96'}>
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="업체·대표·연락처 이름·전화·담당자 검색"
          className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 focus:bg-white transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 text-xs flex items-center justify-center"
            aria-label="검색어 지우기"
          >
            ×
          </button>
        )}
      </div>

      <Link
        href="/clients/intake?tab=consultation"
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        title="신규 유입"
        aria-label="신규 유입"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Link>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,28rem)] sm:w-[32rem] z-50 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              {searching ? `"${query}" 검색 중…` : `"${query}" 검색 결과 없음`}
            </p>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600">
                  검색 결과 <span className="text-blue-600">{results.length}</span>건
                </span>
                <span className="text-[10px] text-gray-400">더보기로 상세 · Esc 닫기</span>
              </div>
              <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-2 space-y-2">
                {results.map(record => (
                  <ClientExpandableCard
                    key={record.id}
                    client={record}
                    churn={record.churn}
                    query={query}
                    onSelect={() => handleSelect(record)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
