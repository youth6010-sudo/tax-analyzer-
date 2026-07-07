'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
import { hydratePortal, prefetchSearchIndex } from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20';

type Props = {
  onSelect: (client: ClientRecord) => void;
  disabled?: boolean;
};

export default function FilingCheckClientAdd({ onSelect, disabled }: Props) {
  const isMaster = useIsMasterUser();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (!q || isMaster === null) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const params = new URLSearchParams({ q, scope: 'notice' });
      if (!isMaster) params.set('mineOnly', '1');

      fetch(`/api/clients/search?${params.toString()}`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : { clients: [] }))
        .then(data => {
          const api = (data.clients ?? []) as ClientSearchResult[];
          setResults(mergeClientSearchResults([], api));
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setResults([]);
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isMaster]);

  const placeholder = isMaster
    ? '수임처 검색 (업체명·사업자번호·대표자)'
    : '내 담당 수임처 검색';

  return (
    <div ref={rootRef} className="relative min-w-[14rem] flex-1 sm:max-w-md">
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isMaster === null || (loading && results.length === 0) ? (
            <p className="px-3 py-3 text-center text-sm text-slate-400">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-center text-sm text-slate-400">검색 결과 없음</p>
          ) : (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                onClick={() => {
                  onSelect(c);
                  setQuery('');
                  setResults([]);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-semibold text-slate-800">
                  {c.companyName || '(상호 없음)'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {[c.businessNo, c.representative, c.manager].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
