'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
import { hydratePortal, prefetchSearchIndex } from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';
import { noticeBtnSecondary, noticeInput } from './noticeUi';

export type PickedClient = { id: string; companyName: string };

type Props = {
  value: PickedClient | null;
  onSelect: (client: PickedClient | null) => void;
};

export default function NoticeClientPicker({ value, onSelect }: Props) {
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
      const local: ClientRecord[] = [];
      setResults(local);
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
  }, [query, isMaster]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{value.companyName}</p>
          <p className="text-[11px] text-slate-500">수임처 연결 · 세목별 자동 저장</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`${noticeBtnSecondary} !px-2 !py-1 text-xs`}
        >
          해제
        </button>
      </div>
    );
  }

  const searchPlaceholder = isMaster
    ? '수임처 검색 (업체명·사업자번호·대표자)'
    : '내 담당 수임처 검색';

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
        placeholder={searchPlaceholder}
        className={`${noticeInput} w-full !py-1.5 text-xs`}
      />

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isMaster === null || (loading && results.length === 0) ? (
            <p className="px-3 py-3 text-center text-sm text-slate-400">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-center text-sm text-slate-500">검색 결과 없음</p>
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
                className="w-full border-b border-slate-100 px-3 py-2 text-left transition last:border-0 hover:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-800">{client.companyName}</p>
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
