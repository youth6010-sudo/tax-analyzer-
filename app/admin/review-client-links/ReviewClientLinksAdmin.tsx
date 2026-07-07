'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalInput,
} from '@/app/components/portal/uiClasses';

type UnlinkedEntry = {
  reviewKey: string;
  reviewName: string;
  source: string;
};

type LinkedEntry = {
  entry: UnlinkedEntry;
  clientIds: string[];
  manual: boolean;
};

type ClientOption = {
  id: string;
  companyName: string;
  manager: string;
  businessNo: string;
  status: string;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function clientLabel(c: ClientOption) {
  const churned = c.status === 'churned' ? ' · 유출' : '';
  return `${c.companyName} · ${c.manager}${churned}`;
}

function ClientPicker({
  clients,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  excludeIds,
}: {
  clients: ClientOption[];
  query: string;
  onQueryChange: (q: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  excludeIds?: Set<string>;
}) {
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = excludeIds ? clients.filter(c => !excludeIds.has(c.id)) : clients;
    if (!q) return pool.slice(0, 25);
    return pool.filter(c => c.companyName.toLowerCase().includes(q)).slice(0, 25);
  }, [clients, query, excludeIds]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        className={`${portalInput} min-w-[12rem] flex-1`}
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder="수임처 검색"
      />
      <select
        className={`${portalInput} min-w-[14rem]`}
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
      >
        <option value="">수임처 선택…</option>
        {suggestions.map(c => (
          <option key={c.id} value={c.id}>
            {clientLabel(c)}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiLinkEditor({
  entry,
  clients,
  initialClientIds,
  onSaved,
  onCancel,
}: {
  entry: UnlinkedEntry;
  clients: ClientOption[];
  initialClientIds?: string[];
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [clientIds, setClientIds] = useState<string[]>(initialClientIds ?? []);
  const [query, setQuery] = useState('');
  const [pickId, setPickId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const exclude = useMemo(() => new Set(clientIds), [clientIds]);

  const addClient = () => {
    if (!pickId || exclude.has(pickId)) return;
    setClientIds(prev => [...prev, pickId]);
    setPickId('');
    setQuery('');
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

  const save = async () => {
    if (!clientIds.length) {
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
          clientIds,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '연결 실패');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusy(false);
    }
  };

  const unlinkOne = async (clientId: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/review-client-links?reviewKey=${encodeURIComponent(entry.reviewKey)}&clientId=${encodeURIComponent(clientId)}`,
        { method: 'DELETE' },
      );
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '해제 실패');
      setClientIds(prev => prev.filter(id => id !== clientId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium text-slate-800">{entry.reviewName}</span>
        <span className="text-xs text-slate-400">({entry.source})</span>
      </div>
      <p className="text-xs text-slate-500">
        복수 업체 행이면 수임처를 여러 개 연결하세요. 맨 위가 매출 대표입니다.
      </p>

      {clientIds.length > 0 ? (
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
      ) : null}

      <ClientPicker
        clients={clients}
        query={query}
        onQueryChange={q => {
          setQuery(q);
          setPickId('');
        }}
        selectedId={pickId}
        onSelect={setPickId}
        excludeIds={exclude}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={portalBtnSecondary} disabled={busy || !pickId} onClick={addClient}>
          목록에 추가
        </button>
        <button type="button" className={portalBtnPrimary} disabled={busy} onClick={() => void save()}>
          {initialClientIds ? '연결 저장' : '연결'}
        </button>
        {onCancel ? (
          <button type="button" className={portalBtnSecondary} disabled={busy} onClick={onCancel}>
            취소
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export default function ReviewClientLinksAdmin() {
  const [unlinked, setUnlinked] = useState<UnlinkedEntry[]>([]);
  const [linked, setLinked] = useState<LinkedEntry[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/review-client-links', { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '목록 로드 실패');
      setUnlinked((data.unlinked as UnlinkedEntry[]) || []);
      setLinked((data.linked as LinkedEntry[]) || []);
      setClients((data.clients as ClientOption[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const manualLinked = linked.filter(l => l.manual);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">검토표 수임처 연결</h1>
            <p className="mt-1 text-sm text-slate-500">
              검토표 상호와 포털 수임처를 수동으로 연결합니다. 유출 업체 포함. (찰리 전용)
            </p>
          </div>
          <Link href="/clients/review-sheet" className={portalBtnSecondary}>
            검토표
          </Link>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className={`${portalCard} mb-6`}>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            수동 연결 ({manualLinked.length})
          </h2>
          {loading ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : manualLinked.length === 0 ? (
            <p className={portalEmptyState}>수동 연결된 업체가 없습니다.</p>
          ) : (
            manualLinked.map(row =>
              editingKey === row.entry.reviewKey ? (
                <MultiLinkEditor
                  key={row.entry.reviewKey}
                  entry={row.entry}
                  clients={clients}
                  initialClientIds={row.clientIds}
                  onSaved={() => {
                    setEditingKey(null);
                    void load();
                  }}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <div
                  key={row.entry.reviewKey}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3 last:border-0"
                >
                  <div>
                    <span className="font-medium text-slate-800">{row.entry.reviewName}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {row.clientIds.length}곳 연결
                    </span>
                  </div>
                  <button
                    type="button"
                    className={portalBtnSecondary}
                    onClick={() => setEditingKey(row.entry.reviewKey)}
                  >
                    수정
                  </button>
                </div>
              ),
            )
          )}
        </section>

        <section className={portalCard}>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">미연결 ({unlinked.length})</h2>
          {loading ? (
            <p className="text-sm text-slate-500">불러오는 중…</p>
          ) : unlinked.length === 0 ? (
            <p className={portalEmptyState}>미연결 업체가 없습니다.</p>
          ) : (
            unlinked.map(entry => (
              <MultiLinkEditor
                key={entry.reviewKey}
                entry={entry}
                clients={clients}
                onSaved={() => void load()}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}
