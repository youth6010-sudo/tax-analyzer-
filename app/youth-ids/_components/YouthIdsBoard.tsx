'use client';

import { useMemo, useState } from 'react';
import { portalEmptyState, portalInput } from '@/app/components/portal/uiClasses';
import type { YouthIdCategory, YouthIdEntry, YouthIdField } from '@/lib/youthIds';

type Props = {
  categories: YouthIdCategory[];
  me: string;
  configured: boolean;
};

const chipCls = (active: boolean) =>
  [
    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
    active
      ? 'border-blue-300 bg-blue-50 text-blue-800'
      : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100',
  ].join(' ');

const chipCountCls = (active: boolean) =>
  [
    'tabular-nums rounded px-1 py-px text-[10px] font-semibold',
    active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500',
  ].join(' ');

export default function YouthIdsBoard({ categories, me, configured }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>('all');
  const [viewAll, setViewAll] = useState(false);

  const q = query.trim().toLowerCase();

  // 내 계정 + 공용만(기본) / 전체보기 시 전부
  const scoped = useMemo(() => {
    return categories
      .map(cat => ({
        ...cat,
        entries: viewAll ? cat.entries : cat.entries.filter(e => !e.owner || e.owner === me),
      }))
      .filter(cat => cat.entries.length > 0);
  }, [categories, viewAll, me]);

  const filtered = useMemo(() => {
    return scoped
      .filter(cat => active === 'all' || cat.id === active)
      .map(cat => ({
        ...cat,
        entries: q ? cat.entries.filter(e => entryMatches(e, q)) : cat.entries,
      }))
      .filter(cat => cat.entries.length > 0);
  }, [scoped, active, q]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="항목·ID·메모 검색…"
          className={`${portalInput} !py-1.5 w-full sm:w-64`}
        />
        <button
          type="button"
          onClick={() => setViewAll(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
            viewAll
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {viewAll ? '전체보기 ✓' : '전체보기'}
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {viewAll ? (
            <>전 직원 계정·자료를 모두 표시 중</>
          ) : (
            <>
              <b className="text-slate-700">{me}</b>님 계정 + 공용만 표시
            </>
          )}
        </span>
      </div>

      {scoped.length === 0 ? (
        <div className={portalEmptyState}>표시할 자료가 없습니다.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setActive('all')} className={chipCls(active === 'all')}>
              전체
              <span className={chipCountCls(active === 'all')}>
                {scoped.reduce((n, c) => n + c.entries.length, 0)}
              </span>
            </button>
            {scoped.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActive(cat.id)}
                className={chipCls(active === cat.id)}
              >
                {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
                {cat.label}
                <span className={chipCountCls(active === cat.id)}>{cat.entries.length}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className={portalEmptyState}>검색 결과가 없습니다.</div>
          ) : (
            <div className="space-y-5">
              {filtered.map(cat => (
                <section key={cat.id}>
                  <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
                    {cat.label}
                    <span className="font-medium normal-case text-slate-400">{cat.entries.length}건</span>
                  </h2>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cat.entries.map(entry => (
                      <EntryCard key={entry.id} entry={entry} me={me} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function entryMatches(e: YouthIdEntry, q: string): boolean {
  if (e.title.toLowerCase().includes(q)) return true;
  if (e.note?.toLowerCase().includes(q)) return true;
  if (e.owner?.toLowerCase().includes(q)) return true;
  return e.fields.some(f => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q));
}

function EntryCard({ entry, me }: { entry: YouthIdEntry; me: string }) {
  const mine = entry.owner === me;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-snug text-slate-900" title={entry.title}>
            {entry.title}
          </p>
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[11px] text-blue-600 hover:underline"
            >
              {entry.url.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
        </div>
        {entry.owner ? (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              mine ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {mine ? '내 계정' : entry.owner}
          </span>
        ) : (
          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            공용
          </span>
        )}
      </div>

      <dl className="space-y-0.5">
        {entry.fields.map((f, i) => (
          <FieldRow key={`${f.label}-${i}`} field={f} />
        ))}
      </dl>

      {entry.note ? (
        <p className="border-t border-slate-100 pt-1 text-[11px] leading-relaxed text-slate-500">{entry.note}</p>
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
      setTimeout(() => setCopied(false), 1000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group flex items-center gap-1.5 text-[12px]">
      <dt className="w-12 shrink-0 text-[11px] font-medium text-slate-400">{field.label}</dt>
      <dd
        className="min-w-0 flex-1 cursor-pointer truncate font-mono text-slate-800"
        title={field.value}
        onClick={copy}
      >
        {field.value}
      </dd>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-[10px] text-slate-300 hover:text-blue-600 group-hover:text-slate-400"
        aria-label="복사"
      >
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}
