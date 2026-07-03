'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
import { hydratePortal } from '@/app/utils/portalStore';

type Props = {
  disabled?: boolean;
  /** 이미 연결된 수임처 — 다른 업체 선택 시 확인 */
  currentClientId?: string | null;
  onLinked: (client: ClientRecord) => void;
};

export default function IntakeClientLink({
  disabled,
  currentClientId = null,
  onLinked,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    hydratePortal();
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
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setResults([]);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      // 활성 수임처만 — 로컬 캐시(삭제·이탈 포함 stale)는 쓰지 않음
      fetch(`/api/clients/search?q=${encodeURIComponent(q)}&activeOnly=1`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : { clients: [] }))
        .then(data => {
          setResults((data.clients ?? []) as ClientSearchResult[]);
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setResults([]);
        })
        .finally(() => setLoading(false));
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const pick = async (client: ClientRecord) => {
    if (currentClientId && client.id !== currentClientId) {
      const ok = window.confirm(
        `연결 수임처를 「${client.companyName}」으로 변경하시겠습니까?`,
      );
      if (!ok) return;
    }

    setLinking(true);
    try {
      onLinked(client);
      setQuery('');
      setResults([]);
      setOpen(false);
    } finally {
      setLinking(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        type="search"
        value={query}
        disabled={disabled || linking}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="기존 수임처 검색·연결"
        className="w-full min-w-0 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
      />
      {open && query.trim() && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">검색 중…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">결과 없음</li>
          )}
          {results.map(c => (
            <li key={c.id}>
              <button
                type="button"
                disabled={linking}
                onClick={() => void pick(c)}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-indigo-50 ${
                  currentClientId === c.id ? 'bg-emerald-50' : ''
                }`}
              >
                <span className="font-semibold text-slate-900">{c.companyName}</span>
                {c.manager && (
                  <span className="ml-2 text-slate-500">{c.manager}</span>
                )}
                {currentClientId === c.id && (
                  <span className="ml-2 text-[10px] font-bold text-emerald-700">연결됨</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
