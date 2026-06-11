'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactDatabase, ContactRecord, ContactSearchField } from '../types/contact';
import { BUSINESS_ENTITY_LABEL, SERVICE_TYPE_LABEL } from '../types/contact';
import { searchContacts } from '../utils/contactSearch';
import { TAX_TYPES } from '../config/taxTypes';

const TAX_LABEL: Record<string, string> = Object.fromEntries(
  TAX_TYPES.map(t => [t.id, t.label]),
);

function Highlight({ text, query }: { text: string; query: string }) {
  if (!text) return <span className="text-gray-300">-</span>;
  const q = query.trim();
  if (!q) return <span>{text}</span>;

  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);

  if (idx >= 0) {
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-amber-300 text-gray-900 font-bold rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </span>
    );
  }

  return <span>{text}</span>;
}

function ResultCard({
  record,
  query,
  matchedFields,
  onSelect,
}: {
  record: ContactRecord;
  query: string;
  matchedFields: ContactSearchField[];
  onSelect: (id: string) => void;
}) {
  const isMatched = (field: ContactSearchField) => matchedFields.includes(field);

  const fields: { key: ContactSearchField; label: string; value: string; mono?: boolean }[] = [
    { key: 'manager', label: '담당자', value: record.manager },
    { key: 'representative', label: '대표자', value: record.representative },
    { key: 'businessNo', label: '사업자번호', value: record.businessNo, mono: true },
    { key: 'corporateNo', label: '법인번호', value: record.corporateNo, mono: true },
    { key: 'residentNo', label: '주민번호', value: record.residentNo, mono: true },
    { key: 'phone', label: '전화번호', value: record.phone, mono: true },
  ];

  return (
    <button
      type="button"
      onClick={() => onSelect(record.id)}
      className="w-full text-left rounded-xl border border-gray-100 bg-white overflow-hidden hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="px-3 py-2.5 bg-blue-50 border-b border-blue-100 text-gray-900 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black leading-snug text-gray-900 group-hover:text-blue-800">
            <Highlight text={record.companyName} query={query} />
          </h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {record.businessEntityType && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {BUSINESS_ENTITY_LABEL[record.businessEntityType]}
              </span>
            )}
            {record.serviceTypes.map(t => (
              <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                {SERVICE_TYPE_LABEL[t]}
              </span>
            ))}
            {record.taxTypes.map(t => (
              <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                {TAX_LABEL[t] ?? t}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {record.manager && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-600 text-white">
              {record.manager}
            </span>
          )}
          <span className="text-[10px] font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
            자세히 →
          </span>
        </div>
      </div>
      <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {fields.map(({ key, label, value, mono }) => (
          <div
            key={key}
            className={`rounded-lg px-2 py-1.5 text-[11px] ${
              isMatched(key)
                ? 'bg-amber-100 border border-amber-300 text-gray-900'
                : 'bg-gray-50'
            }`}
          >
            <span className="text-[9px] font-bold text-gray-400 block">{label}</span>
            <span className={`font-semibold text-gray-800 ${mono ? 'font-mono' : ''}`}>
              <Highlight text={value || '-'} query={query} />
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

export default function ContactHeaderSearch() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data/contacts.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as ContactDatabase;
        if (!cancelled) {
          setContacts(
            data.contacts.map(c => ({
              ...c,
              businessEntityType: c.businessEntityType ?? '',
              serviceTypes: c.serviceTypes ?? [],
              corporateNo: c.corporateNo ?? '',
            })),
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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

  const results = useMemo(() => searchContacts(contacts, query), [contacts, query]);
  const showPanel = open && query.trim().length > 0;

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setOpen(false);
    router.push(`/tax/contacts/${id}`);
  }, [router]);

  return (
    <div ref={rootRef} className="relative w-full sm:w-80 lg:w-96 shrink-0">
      <div className="relative">
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
          placeholder="업체·대표·사업자번호·전화·담당자 검색"
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent focus:bg-white transition-all"
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

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,28rem)] sm:w-[32rem] z-50 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          {loading ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">불러오는 중…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              &quot;{query}&quot; 검색 결과 없음
            </p>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600">
                  검색 결과 <span className="text-blue-600">{results.length}</span>건
                </span>
                <span className="text-[10px] text-gray-400">클릭하여 상세 보기 · Esc로 닫기</span>
              </div>
              <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-2 space-y-2">
                {results.map(({ record, matchedFields }) => (
                  <ResultCard
                    key={record.id}
                    record={record}
                    query={query}
                    matchedFields={matchedFields}
                    onSelect={handleSelect}
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
