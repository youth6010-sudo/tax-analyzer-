'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import { compactSearchText } from '@/app/utils/searchNormalize';
import { portalInput } from '@/app/components/portal/uiClasses';

type Props = {
  candidates: ClientRecord[];
  clientId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  placeholder?: string;
  emptyHint?: string;
};

function matchClient(client: ClientRecord, query: string): boolean {
  const needle = compactSearchText(query);
  if (!needle) return false;
  const hay = compactSearchText(
    [
      client.companyName,
      client.businessNo,
      client.representative,
      client.manager,
      client.phone,
    ].join(' '),
  );
  return hay.includes(needle);
}

export default function ScopedClientSearch({
  candidates,
  clientId,
  onSelect,
  loading = false,
  placeholder = '업체명·사업자번호·대표자로 검색',
  emptyHint = '검색 결과 없음',
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => candidates.find(c => c.id === clientId) ?? null,
    [candidates, clientId],
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return candidates.filter(c => matchClient(c, q)).slice(0, 20);
  }, [candidates, query]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  if (loading) {
    return (
      <input
        disabled
        placeholder="수임처 불러오는 중…"
        className={portalInput + ' w-full text-xs py-1.5 disabled:opacity-60'}
      />
    );
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900 truncate">{selected.companyName}</p>
          <p className="text-[10px] text-slate-500 truncate">
            {[selected.manager, selected.businessNo, selected.representative].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect('');
            setQuery('');
            setOpen(false);
          }}
          className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 text-blue-700 bg-white hover:bg-blue-100"
        >
          변경
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
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={candidates.length === 0 ? '선택 가능한 수임처 없음' : placeholder}
        disabled={candidates.length === 0}
        className={portalInput + ' w-full text-xs py-1.5 disabled:opacity-60'}
      />

      {open && query.trim() && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500 text-center">{emptyHint}</p>
          ) : (
            results.map(client => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onSelect(client.id);
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-50 last:border-0"
              >
                <p className="text-xs font-bold text-slate-900">{client.companyName}</p>
                <p className="text-[10px] text-slate-500">
                  {[client.manager, client.businessNo, client.representative].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {candidates.length > 0 && !query.trim() && (
        <p className="mt-1 text-[10px] text-slate-400">
          {candidates.length}곳 중 검색 (세목 범위 내)
        </p>
      )}
    </div>
  );
}
