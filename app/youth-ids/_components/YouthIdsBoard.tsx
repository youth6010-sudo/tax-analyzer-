'use client';

import { useMemo, useState } from 'react';
import {
  portalCard,
  portalChip,
  portalChipCount,
  portalEmptyState,
  portalInput,
} from '@/app/components/portal/uiClasses';
import type { YouthIdCategory, YouthIdEntry, YouthIdField } from '@/lib/youthIds';

type Props = {
  categories: YouthIdCategory[];
  me: string;
  configured: boolean;
};

export default function YouthIdsBoard({ categories, me, configured }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>('all');

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return categories
      .filter(cat => active === 'all' || cat.id === active)
      .map(cat => ({
        ...cat,
        entries: q
          ? cat.entries.filter(e => entryMatches(e, q))
          : cat.entries,
      }))
      .filter(cat => cat.entries.length > 0);
  }, [categories, active, q]);

  if (!configured) {
    return (
      <div className={portalEmptyState}>
        아직 자료가 등록되지 않았습니다.
        <br />
        <span className="text-slate-500">
          관리자: Vercel 환경변수 <code className="font-mono">YOUTH_IDS_JSON</code> 에 데이터를 넣어주세요.
        </span>
      </div>
    );
  }

  if (categories.length === 0) {
    return <div className={portalEmptyState}>표시할 수 있는 내 계정 · 공용 자료가 없습니다.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="항목·ID·메모 검색…"
          className={`${portalInput} w-full sm:w-72`}
        />
        <span className="portal-meta ml-auto text-xs">
          PIN 기준 <b className="text-slate-700">내 계정 + 공용</b> 자료만 표시됩니다.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setActive('all')} className={portalChip(active === 'all')}>
          전체
          <span className={portalChipCount(active === 'all')}>
            {categories.reduce((n, c) => n + c.entries.length, 0)}
          </span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActive(cat.id)}
            className={portalChip(active === cat.id)}
          >
            {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
            {cat.label}
            <span className={portalChipCount(active === cat.id)}>{cat.entries.length}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={portalEmptyState}>검색 결과가 없습니다.</div>
      ) : (
        <div className="space-y-7">
          {filtered.map(cat => (
            <section key={cat.id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
                {cat.label}
                <span className="text-slate-400 font-medium normal-case">{cat.entries.length}건</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cat.entries.map(entry => (
                  <EntryCard key={entry.id} entry={entry} me={me} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function entryMatches(e: YouthIdEntry, q: string): boolean {
  if (e.title.toLowerCase().includes(q)) return true;
  if (e.note?.toLowerCase().includes(q)) return true;
  if (e.owner?.toLowerCase().includes(q)) return true;
  return e.fields.some(
    f => f.label.toLowerCase().includes(q) || (!f.secret && f.value.toLowerCase().includes(q)),
  );
}

function EntryCard({ entry, me }: { entry: YouthIdEntry; me: string }) {
  const mine = entry.owner === me;
  return (
    <div className={`${portalCard} flex flex-col gap-3 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 leading-snug break-words">{entry.title}</p>
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline break-all"
            >
              {entry.url.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
        </div>
        {entry.owner ? (
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${
              mine ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {mine ? '내 계정' : entry.owner}
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            공용
          </span>
        )}
      </div>

      <dl className="space-y-1.5">
        {entry.fields.map((f, i) => (
          <FieldRow key={`${f.label}-${i}`} field={f} />
        ))}
      </dl>

      {entry.note ? (
        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{entry.note}</p>
      ) : null}
    </div>
  );
}

function FieldRow({ field }: { field: YouthIdField }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <dt className="w-16 shrink-0 text-xs font-medium text-slate-400">{field.label}</dt>
      <dd className="min-w-0 flex-1 font-mono text-slate-800 truncate" title={field.value}>
        {field.value}
      </dd>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-xs text-slate-400 hover:text-blue-600"
        aria-label="복사"
      >
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}
