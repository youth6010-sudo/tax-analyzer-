'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalInput,
} from '@/app/components/portal/uiClasses';

type ReviewTaxKind = 'income' | 'corp-tax' | 'corp-fee';

type ReviewEntry = {
  reviewKey: string;
  reviewName: string;
  source: string;
  sources?: { taxKind: ReviewTaxKind; sheetName: string; owner: string }[];
  taxKinds?: ReviewTaxKind[];
  owners?: string[];
};

type MatchSuggestion = {
  clientId: string;
  companyName: string;
  manager: string;
  businessNo: string;
  reason: string;
};

type LinkedEntry = {
  entry: ReviewEntry;
  clientIds: string[];
  manual: boolean;
  matchMethod?: string;
};

type ClientOption = {
  id: string;
  companyName: string;
  manager: string;
  businessNo: string;
  status: string;
};

type IndexMeta = {
  ready: boolean;
  builtAt: string | null;
  entryCount: number;
};

type TaxTab = 'all' | ReviewTaxKind;

const TAX_TABS: { id: TaxTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'income', label: '종합소득세' },
  { id: 'corp-tax', label: '법인세(신고)' },
  { id: 'corp-fee', label: '법인세(조정료)' },
];

const TAX_KIND_LABEL: Record<ReviewTaxKind, string> = {
  income: '종소',
  'corp-tax': '법인신고',
  'corp-fee': '법인조정료',
};

function formatIndexBuiltAt(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function useLazySuggestions(entry: ReviewEntry): MatchSuggestion[] | undefined {
  const [items, setItems] = useState<MatchSuggestion[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ reviewKey: entry.reviewKey });
        const owner = entry.owners?.[0];
        if (owner) params.set('owner', owner);
        const res = await fetch(`/api/admin/review-client-links/suggestions?${params}`);
        const data = await readJson(res);
        if (!cancelled && res.ok) {
          setItems((data.suggestions as MatchSuggestion[]) || []);
        }
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.reviewKey, entry.owners]);

  return items;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function deleteReviewLinks(reviewKey: string, clientId?: string): Promise<void> {
  const res = await fetch('/api/admin/review-client-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete',
      reviewKey,
      ...(clientId ? { clientId } : {}),
    }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error((data.error as string) || '연결 삭제 실패');
}

function isLegacyStubEntry(entry: ReviewEntry): boolean {
  return entryTaxKinds(entry).length === 0 && !entryOwners(entry);
}

function clientLabel(c: ClientOption) {
  const churned = c.status === 'churned' ? ' · 유출' : '';
  return `${c.companyName} · ${c.manager}${churned}`;
}

function entryOwners(entry: ReviewEntry): string {
  if (entry.owners?.length) return entry.owners.join(', ');
  const fromSources = entry.sources?.map(s => s.owner).filter(Boolean) ?? [];
  return [...new Set(fromSources)].join(', ');
}

function entrySourceLabel(entry: ReviewEntry): string {
  if (entry.source) return entry.source;
  const sheets = entry.sources?.map(s => s.sheetName).filter(Boolean) ?? [];
  return [...new Set(sheets)].join(', ');
}

function entryTaxKinds(entry: ReviewEntry): ReviewTaxKind[] {
  if (entry.taxKinds?.length) return entry.taxKinds;
  const fromSources = entry.sources?.map(s => s.taxKind) ?? [];
  return [...new Set(fromSources)];
}

function matchesTaxTab(entry: ReviewEntry, tab: TaxTab): boolean {
  if (tab === 'all') return true;
  return entryTaxKinds(entry).includes(tab);
}

function matchesSearch(
  entry: ReviewEntry,
  linked: LinkedEntry | null,
  clients: ClientOption[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (entry.reviewName.toLowerCase().includes(q)) return true;
  if (entryOwners(entry).toLowerCase().includes(q)) return true;
  if (entrySourceLabel(entry).toLowerCase().includes(q)) return true;
  if (!linked) return false;
  const clientMap = new Map(clients.map(c => [c.id, c]));
  return linked.clientIds.some(id => {
    const c = clientMap.get(id);
    if (!c) return false;
    return (
      c.companyName.toLowerCase().includes(q) ||
      c.businessNo.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      c.manager.toLowerCase().includes(q)
    );
  });
}

function QuickClientSearch({
  initialQuery = '',
  placeholder = '수임처 검색 (상호·담당·사업자번호)',
  excludeIds,
  disabled,
  onPick,
}: {
  initialQuery?: string;
  placeholder?: string;
  excludeIds?: Set<string>;
  disabled?: boolean;
  onPick: (clientId: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ClientOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ q, includeChurned: '1' });
          const res = await fetch(`/api/clients/search?${params}`);
          const data = await readJson(res);
          const list = (data.clients as ClientOption[]) || [];
          const filtered = excludeIds ? list.filter(c => !excludeIds.has(c.id)) : list;
          setResults(filtered.slice(0, 20));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, excludeIds]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="search"
        className={portalInput}
        value={query}
        disabled={disabled}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
      />
      {query.trim().length >= 2 ? (
        searching ? (
          <p className="text-xs text-slate-500">검색 중…</p>
        ) : results.length === 0 ? (
          <p className="text-xs text-slate-500">검색 결과 없음</p>
        ) : (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {results.map(c => (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-55"
                onClick={() => void onPick(c.id)}
              >
                <span className="font-medium text-slate-800">{c.companyName}</span>
                <span className="text-xs text-slate-500">{clientLabel(c)}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <p className="text-xs text-slate-500">2글자 이상 입력하면 검색됩니다</p>
      )}
    </div>
  );
}

function SuggestionChips({
  items,
  busy,
  onPick,
}: {
  items: MatchSuggestion[];
  busy?: boolean;
  onPick: (clientId: string) => void | Promise<void>;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">추천:</span>
      {items.map(s => (
        <button
          key={s.clientId}
          type="button"
          disabled={busy}
          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-55"
          title={s.reason}
          onClick={() => void onPick(s.clientId)}
        >
          {s.companyName} · {s.manager}
        </button>
      ))}
    </div>
  );
}

function EntryMeta({ entry }: { entry: ReviewEntry }) {
  const kinds = entryTaxKinds(entry);
  const legacy = isLegacyStubEntry(entry);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {kinds.map(k => (
        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
          {TAX_KIND_LABEL[k]}
        </span>
      ))}
      {entryOwners(entry) ? <span>담당 {entryOwners(entry)}</span> : null}
      {entrySourceLabel(entry) ? <span className="text-slate-400">· {entrySourceLabel(entry)}</span> : null}
      {legacy ? (
        <span
          className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800"
          title={entry.reviewKey}
        >
          레거시 키 · 중복이면 연결 삭제
        </span>
      ) : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  hint,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${portalCard} mb-6`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onToggle}
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-700">
            {title} ({count})
          </h2>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="text-xs text-slate-400">{open ? '접기' : '펼치기'}</span>
      </button>
      {open ? <div className="mt-3 border-t border-slate-100 pt-3">{children}</div> : null}
    </section>
  );
}

function MultiLinkEditor({
  entry,
  clients,
  initialClientIds,
  suggestionItems,
  multiMode = false,
  onLinkSaved,
  onLinkDeleted,
  onCancel,
}: {
  entry: ReviewEntry;
  clients: ClientOption[];
  initialClientIds?: string[];
  suggestionItems?: MatchSuggestion[];
  multiMode?: boolean;
  onLinkSaved: (clientIds: string[]) => void;
  onLinkDeleted?: () => void;
  onCancel?: () => void;
}) {
  const isMulti = multiMode || (initialClientIds != null && initialClientIds.length > 1);
  const isEditingExisting = initialClientIds != null;
  const [clientIds, setClientIds] = useState<string[]>(initialClientIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const exclude = useMemo(() => new Set(clientIds), [clientIds]);

  const saveWithIds = async (ids: string[]) => {
    if (!ids.length) {
      setError('수임처를 1곳 이상 선택하세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewKey: entry.reviewKey,
          reviewName: entry.reviewName,
          clientIds: ids,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '연결 실패');
      onLinkSaved(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => saveWithIds(clientIds);

  const pickClient = async (clientId: string) => {
    if (isMulti) {
      if (exclude.has(clientId)) return;
      setClientIds(prev => [...prev, clientId]);
      return;
    }
    await saveWithIds([clientId]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= clientIds.length) return;
    setClientIds(prev => {
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  const unlinkOne = async (clientId: string) => {
    setBusy(true);
    setError('');
    try {
      await deleteReviewLinks(entry.reviewKey, clientId);
      const next = clientIds.filter(id => id !== clientId);
      setClientIds(next);
      if (next.length === 0) onLinkDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async () => {
    if (
      !window.confirm(
        `「${entry.reviewName}」 연결을 전체 삭제할까요?\n(다른 줄에 같은 업체 연결이 있으면 그쪽은 유지됩니다)`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteReviewLinks(entry.reviewKey);
      onLinkDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-0">
      <div>
        <span className="font-medium text-slate-800">{entry.reviewName}</span>
        <EntryMeta entry={entry} />
      </div>

      {isMulti ? (
        <p className="text-xs text-slate-500">맨 위 수임처가 매출 대표입니다. ↑↓로 순서를 바꿀 수 있습니다.</p>
      ) : null}

      {suggestionItems && suggestionItems.length > 0 ? (
        <SuggestionChips items={suggestionItems} busy={busy} onPick={pickClient} />
      ) : null}

      {isMulti ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">선택한 수임처</p>
          {clientIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              아래 검색에서 수임처를 추가하세요. 맨 위가 매출 대표입니다.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {clientIds.map((id, idx) => {
                const c = clientMap.get(id);
                return (
                  <li
                    key={id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="tabular-nums text-xs font-semibold text-slate-400 w-5">
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      {c ? clientLabel(c) : id}
                      {idx === 0 ? (
                        <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                          대표
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={portalBtnSecondary}
                      disabled={busy || idx === 0}
                      onClick={() => move(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={portalBtnSecondary}
                      disabled={busy || idx === clientIds.length - 1}
                      onClick={() => move(idx, 1)}
                    >
                      ↓
                    </button>
                    {initialClientIds ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        disabled={busy}
                        onClick={() => void unlinkOne(id)}
                      >
                        해제
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        disabled={busy}
                        onClick={() => setClientIds(prev => prev.filter(x => x !== id))}
                      >
                        제거
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}

      {isMulti ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={portalBtnPrimary} disabled={busy} onClick={() => void save()}>
            연결 저장
          </button>
          {onCancel ? (
            <button type="button" className={portalBtnSecondary} disabled={busy} onClick={onCancel}>
              취소
            </button>
          ) : null}
        </div>
      ) : null}

      {!isMulti && clientIds.length === 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>
            현재:{' '}
            {clientMap.get(clientIds[0]) ? clientLabel(clientMap.get(clientIds[0])!) : clientIds[0]}
          </span>
          {isEditingExisting ? (
            <button
              type="button"
              className="text-xs text-red-600 hover:underline"
              disabled={busy}
              onClick={() => void unlinkOne(clientIds[0])}
            >
              해제
            </button>
          ) : null}
        </div>
      ) : null}

      <QuickClientSearch
        initialQuery=""
        placeholder={
          isMulti ? '수임처 검색 (상호·담당·사업자번호)' : `${entry.reviewName} 검색…`
        }
        excludeIds={isMulti ? exclude : undefined}
        disabled={busy}
        onPick={pickClient}
      />

      {!isMulti && onCancel ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={portalBtnSecondary} disabled={busy} onClick={onCancel}>
            취소
          </button>
          {isEditingExisting ? (
            <button
              type="button"
              className="text-sm text-red-600 hover:underline disabled:opacity-55"
              disabled={busy}
              onClick={() => void deleteAll()}
            >
              연결 전체 삭제
            </button>
          ) : null}
        </div>
      ) : null}

      {isMulti && isEditingExisting ? (
        <button
          type="button"
          className="self-start text-sm text-red-600 hover:underline disabled:opacity-55"
          disabled={busy}
          onClick={() => void deleteAll()}
        >
          연결 전체 삭제
        </button>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function QuickLinkRow({
  entry,
  clients,
  onLinkSaved,
}: {
  entry: ReviewEntry;
  clients: ClientOption[];
  onLinkSaved: (entry: ReviewEntry, clientIds: string[]) => void;
}) {
  const suggestionItems = useLazySuggestions(entry);
  const [multiMode, setMultiMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saveWithIds = async (ids: string[]) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewKey: entry.reviewKey,
          reviewName: entry.reviewName,
          clientIds: ids,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '연결 실패');
      onLinkSaved(entry, ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusy(false);
    }
  };

  if (multiMode) {
    return (
      <MultiLinkEditor
        entry={entry}
        clients={clients}
        suggestionItems={suggestionItems}
        multiMode
        onLinkSaved={ids => onLinkSaved(entry, ids)}
        onCancel={() => setMultiMode(false)}
      />
    );
  }

  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div>
        <span className="font-medium text-slate-800">{entry.reviewName}</span>
        <EntryMeta entry={entry} />
      </div>

      {suggestionItems && suggestionItems.length > 0 ? (
        <div className="mt-2">
          <SuggestionChips items={suggestionItems} busy={busy} onPick={id => saveWithIds([id])} />
        </div>
      ) : null}

      <div className="mt-2">
        <QuickClientSearch
          initialQuery=""
          placeholder={`${entry.reviewName} 검색…`}
          disabled={busy}
          onPick={id => saveWithIds([id])}
        />
      </div>

      <button
        type="button"
        className="mt-2 text-xs text-slate-500 hover:text-slate-700 hover:underline"
        onClick={() => setMultiMode(true)}
      >
        복수 연결 · 대표 업체 지정…
      </button>

      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function LinkedRow({
  row,
  clients,
  editingKey,
  setEditingKey,
  onLinkUpdated,
  onLinkDeleted,
}: {
  row: LinkedEntry;
  clients: ClientOption[];
  editingKey: string | null;
  setEditingKey: (key: string | null) => void;
  onLinkUpdated: (entry: ReviewEntry, clientIds: string[]) => void;
  onLinkDeleted: (entry: ReviewEntry) => void;
}) {
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');

  const deleteAll = async () => {
    if (
      !window.confirm(
        `「${row.entry.reviewName}」 연결을 전체 삭제할까요?\n(다른 줄에 같은 업체 연결이 있으면 그쪽은 유지됩니다)`,
      )
    ) {
      return;
    }
    setBusy(true);
    setRowError('');
    try {
      await deleteReviewLinks(row.entry.reviewKey);
      onLinkDeleted(row.entry);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : '연결 삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  if (editingKey === row.entry.reviewKey) {
    return (
      <MultiLinkEditor
        entry={row.entry}
        clients={clients}
        initialClientIds={row.clientIds}
        onLinkSaved={clientIds => {
          setEditingKey(null);
          onLinkUpdated(row.entry, clientIds);
        }}
        onLinkDeleted={() => {
          setEditingKey(null);
          onLinkDeleted(row.entry);
        }}
        onCancel={() => setEditingKey(null)}
      />
    );
  }

  const names = row.clientIds
    .map(id => clientMap.get(id)?.companyName)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0">
        <span className="font-medium text-slate-800">{row.entry.reviewName}</span>
        <span className="ml-2 text-xs text-slate-400">{row.clientIds.length}곳 연결</span>
        {names ? <p className="mt-0.5 truncate text-xs text-slate-500">{names}</p> : null}
        <EntryMeta entry={row.entry} />
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          className={portalBtnSecondary}
          disabled={busy}
          onClick={() => setEditingKey(row.entry.reviewKey)}
        >
          수정
        </button>
        <button
          type="button"
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-55"
          disabled={busy}
          onClick={() => void deleteAll()}
        >
          연결 삭제
        </button>
      </div>
      {rowError ? <p className="w-full text-sm text-red-600">{rowError}</p> : null}
    </div>
  );
}

export default function ReviewClientLinksAdmin() {
  const [unlinked, setUnlinked] = useState<ReviewEntry[]>([]);
  const [linked, setLinked] = useState<LinkedEntry[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [indexMeta, setIndexMeta] = useState<IndexMeta>({
    ready: false,
    builtAt: null,
    entryCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [autoLinkMsg, setAutoLinkMsg] = useState('');
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [taxTab, setTaxTab] = useState<TaxTab>('all');
  const [search, setSearch] = useState('');
  const [openManual, setOpenManual] = useState(false);
  const [openAuto, setOpenAuto] = useState(false);
  const [openUnlinked, setOpenUnlinked] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links', {
        cache: 'no-store',
        signal: AbortSignal.timeout(55_000),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '목록 로드 실패');
      setUnlinked((data.unlinked as ReviewEntry[]) || []);
      setLinked((data.linked as LinkedEntry[]) || []);
      setClients((data.clients as ClientOption[]) || []);
      setIndexMeta(
        (data.indexMeta as IndexMeta) || { ready: false, builtAt: null, entryCount: 0 },
      );
    } catch (e) {
      const msg =
        e instanceof Error && e.name === 'TimeoutError'
          ? '목록 로드 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
          : e instanceof Error
            ? e.message
            : '목록 로드 실패';
      if (!quiet) setError(msg);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const applyLocalLink = useCallback((entry: ReviewEntry, clientIds: string[]) => {
    setUnlinked(prev => prev.filter(e => e.reviewKey !== entry.reviewKey));
    setLinked(prev => {
      const without = prev.filter(l => l.entry.reviewKey !== entry.reviewKey);
      return [...without, { entry, clientIds, manual: true }];
    });
  }, []);

  const handleLinkSaved = useCallback(
    (entry: ReviewEntry, clientIds: string[]) => {
      applyLocalLink(entry, clientIds);
      void load(true);
    },
    [applyLocalLink, load],
  );

  const handleLinkUpdated = useCallback(
    (entry: ReviewEntry, clientIds: string[]) => {
      setLinked(prev =>
        prev.map(l =>
          l.entry.reviewKey === entry.reviewKey ? { ...l, clientIds, manual: true } : l,
        ),
      );
      void load(true);
    },
    [load],
  );

  const handleLinkDeleted = useCallback(
    (entry: ReviewEntry) => {
      setLinked(prev => prev.filter(l => l.entry.reviewKey !== entry.reviewKey));
      setEditingKey(prev => (prev === entry.reviewKey ? null : prev));
      void load(true);
    },
    [load],
  );

  const runRebuildIndex = async () => {
    setRebuildingIndex(true);
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links/rebuild-index', {
        method: 'POST',
        signal: AbortSignal.timeout(300_000),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '인덱스 빌드 실패');
      if (data.indexMeta) setIndexMeta(data.indexMeta as IndexMeta);
      await load(true);
    } catch (e) {
      const msg =
        e instanceof Error && e.name === 'TimeoutError'
          ? '인덱스 빌드 시간이 초과되었습니다. 터미널에서 npm run rebuild:company-index 를 실행해 주세요.'
          : e instanceof Error
            ? e.message
            : '인덱스 빌드 실패';
      setError(msg);
    } finally {
      setRebuildingIndex(false);
    }
  };

  const runRelinkAuto = async () => {
    if (
      !window.confirm(
        '기존 자동 연결을 모두 삭제한 뒤 새 규칙으로 다시 연결합니다. 수동 연결은 유지됩니다. 계속할까요?',
      )
    ) {
      return;
    }
    setAutoLinking(true);
    setAutoLinkMsg('');
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links/relink-auto', { method: 'POST' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '재연결 실패');
      const cleared = typeof data.cleared === 'number' ? data.cleared : 0;
      const linkedCount = Array.isArray(data.linked) ? data.linked.length : 0;
      const skipped = typeof data.skipped === 'number' ? data.skipped : 0;
      const scopedCount = Array.isArray(data.linked)
        ? (data.linked as { reviewKey?: string }[]).filter(r => (r.reviewKey ?? '').includes('/')).length
        : 0;
      const legacyWarnings = Array.isArray(data.legacyKeyWarnings) ? data.legacyKeyWarnings.length : 0;
      setAutoLinkMsg(
        `자동 연결 ${cleared}건 삭제 후 ${linkedCount}건 재연결(담당 스코프 ${scopedCount}건) · 미매칭 ${skipped}건` +
          (legacyWarnings ? ` · legacy 키 ${legacyWarnings}건 주의` : ''),
      );
      await load();
      setOpenUnlinked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '재연결 실패');
    } finally {
      setAutoLinking(false);
    }
  };

  const runAutoLink = async () => {
    setAutoLinking(true);
    setAutoLinkMsg('');
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links/auto-link', { method: 'POST' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '자동 연결 실패');
      const linkedCount = Array.isArray(data.linked) ? data.linked.length : 0;
      const skipped = typeof data.skipped === 'number' ? data.skipped : 0;
      const byMethod = new Map<string, number>();
      if (Array.isArray(data.linked)) {
        for (const row of data.linked as { method?: string }[]) {
          const m = row.method ?? 'unknown';
          byMethod.set(m, (byMethod.get(m) ?? 0) + 1);
        }
      }
      const methodSummary = [...byMethod.entries()].map(([m, n]) => `${m} ${n}`).join(', ');
      setAutoLinkMsg(
        `자동 연결 ${linkedCount}건 저장 · 미매칭 ${skipped}건${methodSummary ? ` (${methodSummary})` : ''}`,
      );
      await load();
      setOpenUnlinked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '자동 연결 실패');
    } finally {
      setAutoLinking(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const manualLinked = useMemo(
    () =>
      linked.filter(
        l =>
          l.manual &&
          matchesTaxTab(l.entry, taxTab) &&
          matchesSearch(l.entry, l, clients, search),
      ),
    [linked, taxTab, search, clients],
  );

  const autoLinked = useMemo(
    () =>
      linked.filter(
        l =>
          !l.manual &&
          matchesTaxTab(l.entry, taxTab) &&
          matchesSearch(l.entry, l, clients, search),
      ),
    [linked, taxTab, search, clients],
  );

  const filteredUnlinked = useMemo(
    () =>
      unlinked.filter(
        e => matchesTaxTab(e, taxTab) && matchesSearch(e, null, clients, search),
      ),
    [unlinked, taxTab, search, clients],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">검토표 수임처 연결</h1>
            <p className="mt-1 text-sm text-slate-500">
              종소·법인 전 시트 업체와 포털 수임처를 연결합니다. (개발자)
            </p>
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              담당자·성명 기준 연결 규칙 적용 후에는 「자동연결 초기화·재연결」을 한 번 실행해 주세요.
              수동 연결은 유지됩니다.
            </p>
          </div>
          <Link href="/clients/review-sheet" prefetch={false} className={portalBtnSecondary}>
            검토표
          </Link>
        </div>

        {!indexMeta.ready ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">검토표 업체 인덱스가 없습니다.</p>
            <p className="mt-1 text-xs text-amber-800">
              미연결 목록을 보려면 인덱스를 빌드해 주세요. 수동·자동 연결(DB 저장분)은 아래에서 바로 확인할 수 있습니다.
            </p>
            <button
              type="button"
              className={`${portalBtnPrimary} mt-3`}
              disabled={rebuildingIndex || loading}
              onClick={() => void runRebuildIndex()}
            >
              {rebuildingIndex ? '인덱스 빌드 중… (1~2분)' : '인덱스 빌드'}
            </button>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <span>
              인덱스 갱신: {formatIndexBuiltAt(indexMeta.builtAt)} ·{' '}
              {indexMeta.entryCount.toLocaleString()}건
            </span>
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={rebuildingIndex || loading}
              onClick={() => void runRebuildIndex()}
            >
              {rebuildingIndex ? '재빌드 중…' : '인덱스 다시 빌드'}
            </button>
          </div>
        )}

        <div className={`${portalCard} mb-4 flex flex-col gap-3`}>
          <div className="flex flex-wrap gap-2">
            {TAX_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={
                  taxTab === tab.id
                    ? portalBtnPrimary
                    : portalBtnSecondary
                }
                onClick={() => setTaxTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className={portalInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="상호·담당자·사업자번호 검색"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={autoLinking || loading}
              onClick={() => void runAutoLink()}
            >
              {autoLinking ? '자동 연결 중…' : '고신뢰 자동연결 실행'}
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={autoLinking || loading}
              onClick={() => void runRelinkAuto()}
            >
              {autoLinking ? '재연결 중…' : '자동연결 초기화·재연결'}
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              onClick={() => {
                setOpenManual(false);
                setOpenAuto(false);
                setOpenUnlinked(true);
              }}
            >
              미연결만 펼치기
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              onClick={() => {
                setOpenManual(true);
                setOpenAuto(true);
                setOpenUnlinked(true);
              }}
            >
              모두 펼치기
            </button>
          </div>
          {autoLinkMsg ? <p className="text-sm text-emerald-700">{autoLinkMsg}</p> : null}
        </div>

        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={loading}
              onClick={() => void load()}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        <CollapsibleSection
          title="수동 연결"
          count={manualLinked.length}
          open={openManual}
          onToggle={() => setOpenManual(v => !v)}
        >
          {loading ? (
            <p className="text-sm text-slate-500">목록 불러오는 중…</p>
          ) : manualLinked.length === 0 ? (
            <p className={portalEmptyState}>수동 연결된 업체가 없습니다.</p>
          ) : (
            manualLinked.map(row => (
              <LinkedRow
                key={row.entry.reviewKey}
                row={row}
                clients={clients}
                editingKey={editingKey}
                setEditingKey={setEditingKey}
                onLinkUpdated={handleLinkUpdated}
                onLinkDeleted={handleLinkDeleted}
              />
            ))
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="자동 연결"
          count={autoLinked.length}
          open={openAuto}
          onToggle={() => setOpenAuto(v => !v)}
          hint="상호·대표자·담당자 기준 자동 매칭. 수정하면 수동 연결로 저장됩니다."
        >
          {loading ? (
            <p className="text-sm text-slate-500">목록 불러오는 중…</p>
          ) : autoLinked.length === 0 ? (
            <p className={portalEmptyState}>자동 연결된 업체가 없습니다.</p>
          ) : (
            autoLinked.map(row => (
              <LinkedRow
                key={row.entry.reviewKey}
                row={row}
                clients={clients}
                editingKey={editingKey}
                setEditingKey={setEditingKey}
                onLinkUpdated={handleLinkUpdated}
                onLinkDeleted={handleLinkDeleted}
              />
            ))
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="미연결"
          count={filteredUnlinked.length}
          open={openUnlinked}
          onToggle={() => setOpenUnlinked(v => !v)}
        >
          {loading ? (
            <p className="text-sm text-slate-500">목록 불러오는 중…</p>
          ) : !indexMeta.ready ? (
            <p className={portalEmptyState}>
              인덱스 빌드 후 미연결 업체 목록이 표시됩니다.
            </p>
          ) : filteredUnlinked.length === 0 ? (
            <p className={portalEmptyState}>미연결 업체가 없습니다.</p>
          ) : (
            filteredUnlinked.map(entry => (
              <QuickLinkRow
                key={entry.reviewKey}
                entry={entry}
                clients={clients}
                onLinkSaved={handleLinkSaved}
              />
            ))
          )}
        </CollapsibleSection>
      </main>
    </div>
  );
}
