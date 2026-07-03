'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
import { filterClientsForChurnRegistration } from '@/app/utils/churnMatch';
import {
  getPortalChurnRecords,
  getPortalSearchIndex,
  hydratePortal,
  prefetchSearchIndex,
  searchPortalClients,
  subscribePortal,
} from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';

type Props = {
  value: ClientRecord | null;
  onChange: (client: ClientRecord | null) => void;
  disabled?: boolean;
};

export default function ChurnClientSearch({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [churnRecords, setChurnRecords] = useState(() => getPortalChurnRecords());

  useEffect(() => {
    hydratePortal();
    void prefetchSearchIndex();
    return subscribePortal(() => setChurnRecords(getPortalChurnRecords()));
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
    if (value) {
      setQuery('');
      setResults([]);
      setOpen(false);
    }
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (!q || value) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const localRaw = getPortalSearchIndex().length > 0
        ? (searchPortalClients(q) as ClientRecord[])
        : [];
      const local = filterClientsForChurnRegistration(localRaw, churnRecords);
      setResults(local);
      setLoading(true);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      fetch(`/api/clients/search?q=${encodeURIComponent(q)}&includeChurned=1&forChurn=1`, {
        signal: ac.signal,
      })
        .then(r => (r.ok ? r.json() : { clients: [] }))
        .then(data => {
          const api = (data.clients ?? []) as ClientSearchResult[];
          const merged = mergeClientSearchResults(local, api);
          setResults(filterClientsForChurnRegistration(merged, churnRecords));
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setResults(local);
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value, churnRecords]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate">{value.companyName}</p>
          <p className="text-xs text-gray-500 truncate">
            {[value.manager, value.businessNo, value.representative].filter(Boolean).join(' · ')}
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-100"
          >
            변경
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="업체명·사업자번호·대표자·담당자·연락처로 검색"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white disabled:opacity-50"
      />

      {open && query.trim() && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-4 text-sm text-gray-400 text-center">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 text-center">검색 결과 없음</p>
          ) : (
            results.map(client => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onChange(client);
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0"
              >
                <p className="text-sm font-bold text-gray-900">{client.companyName}</p>
                <p className="text-xs text-gray-500">
                  {[client.manager, client.businessNo, client.representative].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
