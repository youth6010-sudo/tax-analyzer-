'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
import {
  getPortalSearchIndex,
  hydratePortal,
  prefetchSearchIndex,
  searchPortalClients,
} from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';

export type PickedClient = { id: string; companyName: string };

type Props = {
  value: PickedClient | null;
  onSelect: (client: PickedClient | null) => void;
};

export default function NoticeClientPicker({ value, onSelect }: Props) {
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
    if (!q) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const local =
        getPortalSearchIndex().length > 0 ? (searchPortalClients(q) as ClientRecord[]) : [];
      setResults(local);
      setLoading(true);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      fetch(`/api/clients/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : { clients: [] }))
        .then(data => {
          const api = (data.clients ?? []) as ClientSearchResult[];
          setResults(mergeClientSearchResults(local, api));
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setResults(local);
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
        <span className="text-base" aria-hidden>
          🔗
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{value.companyName}</p>
          <p className="text-[11px] text-rose-500">수임처 연결됨 · 세목별 자동 저장</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 active:scale-95"
        >
          해제
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={e => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) {
            setResults([]);
            setLoading(false);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder="수임처 검색 (업체명·사업자번호·대표자·담당자)"
        className="w-full rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
      />

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-rose-100 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-500">검색 결과 없음</p>
          ) : (
            results.map(client => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onSelect({ id: client.id, companyName: client.companyName });
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full border-b border-rose-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-rose-50"
              >
                <p className="text-sm font-bold text-slate-800">{client.companyName}</p>
                <p className="text-xs text-slate-500">
                  {[client.manager, client.businessNo, client.representative]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
