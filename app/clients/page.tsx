'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '../components/AppHeader';
import EntityPairGrid from '../components/clients/EntityPairGrid';
import ManagerRosterGrid from '../components/clients/ManagerRosterGrid';
import type { ClientRecord } from '../types/client';
import { hydratePortal } from '@/app/utils/portalStore';
import {
  ALWAYS_VISIBLE_CATEGORIES,
  filterClientsByCategoryVisibility,
  getClientCategory,
  getOptionalCategories,
  MANAGER_DISPLAY_ORDER,
  UNCategorized,
} from '@/app/utils/clientsGrouping';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import {
  buildClientsListUrl,
  parseClientsListState,
  type ClientsListState,
} from '@/app/utils/clientsListState';

export default function ClientsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col bg-gray-50">
        <AppHeader />
        <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
          <p className="text-sm text-gray-500">불러오는 중…</p>
        </main>
      </div>
    }>
      <ClientsPageContent />
    </Suspense>
  );
}

function ClientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlState = useMemo(() => parseClientsListState(searchParams), [searchParams]);
  const scrollRestored = useRef(false);
  const defaultMgrApplied = useRef(false);

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const state: ClientsListState = urlState;

  useEffect(() => {
    hydratePortal();
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) setCurrentUserName(String(data.user.name).trim());
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (state.mineOnly) params.set('mine', '1');
    if (state.includeChurned) params.set('includeChurned', '1');
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    setClients(data.clients ?? []);
  }, [state.mineOnly, state.includeChurned]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleColbertToggle = useCallback(async (id: string, colbert: boolean) => {
    setClients(prev => prev.map(c => (c.id === id ? { ...c, colbert } : c)));
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colbert }),
      });
      if (!res.ok) throw new Error('PATCH failed');
      const data = await res.json();
      setClients(prev => prev.map(c => (c.id === id ? data.client : c)));
    } catch {
      setClients(prev => prev.map(c => (c.id === id ? { ...c, colbert: !colbert } : c)));
    }
  }, []);

  const handleFeeChange = useCallback(async (id: string, feeSummary: number | null) => {
    let prevFee: number | null = null;
    setClients(list => {
      prevFee = list.find(c => c.id === id)?.feeSummary ?? null;
      if (prevFee === feeSummary) return list;
      return list.map(c => (c.id === id ? { ...c, feeSummary } : c));
    });
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeSummary }),
      });
      if (!res.ok) throw new Error('PATCH failed');
      const data = await res.json();
      setClients(list => list.map(c => (c.id === id ? data.client : c)));
    } catch {
      setClients(list => list.map(c => (c.id === id ? { ...c, feeSummary: prevFee } : c)));
    }
  }, []);

  const updateState = useCallback(
    (patch: Partial<ClientsListState>, opts?: { includeScroll?: boolean }) => {
      const next = { ...state, ...patch, scroll: opts?.includeScroll ? window.scrollY : 0 };
      router.replace(buildClientsListUrl(next, { includeScroll: opts?.includeScroll }), { scroll: false });
    },
    [router, state],
  );

  /** URL에 mgr 없을 때 로그인 담당자 기본 선택 */
  useEffect(() => {
    if (defaultMgrApplied.current) return;
    if (state.view !== 'manager') return;
    if (searchParams.get('mgr')) return;
    if (!currentUserName) return;
    defaultMgrApplied.current = true;
    updateState({ visibleManagers: [currentUserName], mineOnly: true });
  }, [currentUserName, state.view, searchParams, updateState]);

  useEffect(() => {
    if (scrollRestored.current || state.scroll <= 0) return;
    scrollRestored.current = true;
    requestAnimationFrame(() => {
      window.scrollTo(0, state.scroll);
    });
  }, [state.scroll]);

  const searchFiltered = useMemo(() => {
    const q = state.q.trim();
    let list: ClientRecord[];

    if (!q) {
      list = [...clients];
    } else {
      const qLower = q.toLowerCase();
      const digits = q.replace(/\D/g, '');

      list = clients.filter(c => {
        const hay = [
          c.companyName,
          c.representative,
          c.manager,
          c.phone,
          c.businessNo,
          c.corporateNo,
          c.residentNo,
          c.primaryContactName ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (hay.includes(qLower)) return true;
        if (digits.length >= 2) {
          const biz = c.businessNo.replace(/\D/g, '');
          const corp = c.corporateNo.replace(/\D/g, '');
          const res = c.residentNo.replace(/\D/g, '');
          const phone = c.phone.replace(/\D/g, '');
          return biz.includes(digits) || corp.includes(digits) || res.includes(digits) || phone.includes(digits);
        }
        return false;
      });
    }

    if (state.manager) {
      list = list.filter(c => (c.manager?.trim() || '미분류') === state.manager);
    }

    return list;
  }, [clients, state]);

  /** 검색 시 hidden 대분류에 매칭되면 자동 노출 */
  const searchRevealedCategories = useMemo(() => {
    const q = state.q.trim();
    if (!q) return [] as string[];
    const revealed = new Set<string>();
    for (const c of searchFiltered) {
      const cat = getClientCategory(c);
      if (!ALWAYS_VISIBLE_CATEGORIES.has(cat)) revealed.add(cat);
    }
    return [...revealed];
  }, [searchFiltered, state.q]);

  const effectiveOptionalCategories = useMemo(() => {
    const set = new Set([...state.optionalCategories, ...searchRevealedCategories]);
    return [...set];
  }, [state.optionalCategories, searchRevealedCategories]);

  const filtered = useMemo(
    () => filterClientsByCategoryVisibility(searchFiltered, effectiveOptionalCategories),
    [searchFiltered, effectiveOptionalCategories],
  );

  const optionalCategories = useMemo(() => getOptionalCategories(clients), [clients]);

  const optionalCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of searchFiltered) {
      const cat = getClientCategory(c);
      if (ALWAYS_VISIBLE_CATEGORIES.has(cat)) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [searchFiltered]);

  const toggleOptionalCategory = useCallback(
    (cat: string, checked: boolean) => {
      const next = checked
        ? [...new Set([...state.optionalCategories, cat])]
        : state.optionalCategories.filter(c => c !== cat);
      updateState({ optionalCategories: next });
    },
    [state.optionalCategories, updateState],
  );

  const managerOptions = useMemo(() => {
    const set = new Set<string>(MANAGER_DISPLAY_ORDER);
    for (const c of searchFiltered) {
      set.add(c.manager?.trim() || UNCategorized);
    }
    return [...set].sort((a, b) => {
      const ia = MANAGER_DISPLAY_ORDER.indexOf(a);
      const ib = MANAGER_DISPLAY_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      if (a === UNCategorized) return 1;
      if (b === UNCategorized) return -1;
      return a.localeCompare(b, 'ko');
    });
  }, [searchFiltered]);

  const managerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of searchFiltered) {
      const mgr = c.manager?.trim() || UNCategorized;
      counts.set(mgr, (counts.get(mgr) ?? 0) + 1);
    }
    return counts;
  }, [searchFiltered]);

  const toggleVisibleManager = useCallback(
    (manager: string, checked: boolean) => {
      const next = checked
        ? [...new Set([...state.visibleManagers, manager])]
        : state.visibleManagers.filter(m => m !== manager);
      updateState({ visibleManagers: next, mineOnly: false });
    },
    [state.visibleManagers, updateState],
  );

  const selectAllManagers = useCallback(() => {
    updateState({ visibleManagers: [...managerOptions], mineOnly: false });
  }, [managerOptions, updateState]);

  const clearManagers = useCallback(() => {
    updateState({ visibleManagers: [] });
  }, [updateState]);

  const totalCount = filtered.length;
  const returnTo = buildClientsListUrl({ ...state, scroll: 0 });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">수임처 관리</h1>
            <p className="text-sm text-gray-600 mt-1">
              수임처 export 기준 · {state.view === 'manager' ? '담당자 세로 · 개인/법인 좌우' : '대분류별 · 업체 상세'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="search"
            value={state.q}
            onChange={e => updateState({ q: e.target.value })}
            placeholder="업체·대표·사업자번호·전화·담당자 검색"
            className="flex-1 min-w-[200px] max-w-md border border-gray-200 rounded-xl px-4 py-2.5 text-base bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
          />
          <select
            value={state.view}
            onChange={e => updateState({ view: e.target.value as 'manager' | 'category' })}
            className="text-base border border-gray-200 rounded-xl px-3 py-2.5 bg-white"
          >
            <option value="manager">담당자별</option>
            <option value="category">대분류별</option>
          </select>
          <select
            value={state.sort}
            onChange={e => updateState({ sort: e.target.value as 'name' | 'code' })}
            className="text-base border border-gray-200 rounded-xl px-3 py-2.5 bg-white"
          >
            <option value="name">이름순</option>
            <option value="code">세무사랑 코드순</option>
          </select>
          <label className="flex items-center gap-2 text-base text-gray-700 px-2">
            <input
              type="checkbox"
              checked={state.mineOnly}
              onChange={e => updateState({ mineOnly: e.target.checked, manager: '' })}
              className="rounded"
            />
            내 담당만
          </label>
          <label className="flex items-center gap-2 text-base text-gray-700 px-2">
            <input
              type="checkbox"
              checked={state.includeChurned}
              onChange={e => updateState({ includeChurned: e.target.checked })}
              className="rounded"
            />
            폐업·해임 포함
          </label>
        </div>

        {state.view === 'manager' && (
          <div className="mb-5 rounded-2xl border border-gray-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 pb-3 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-900 shrink-0">담당자 표시</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllManagers}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  전체 선택
                </button>
                <button
                  type="button"
                  onClick={clearManagers}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  전체 해제
                </button>
                {currentUserName && (
                  <button
                    type="button"
                    onClick={() =>
                      updateState({ visibleManagers: [currentUserName], mineOnly: true })
                    }
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    내 담당만
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {managerOptions.map(mgr => {
                const count = managerCounts.get(mgr) ?? 0;
                const checked = state.visibleManagers.includes(mgr);
                const isSelf = currentUserName === mgr;
                const realName = STAFF_REAL_NAMES[mgr];
                return (
                  <button
                    key={mgr}
                    type="button"
                    onClick={() => toggleVisibleManager(mgr, !checked)}
                    className={[
                      'inline-flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-bold transition-all duration-150',
                      checked
                        ? isSelf
                          ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm shadow-blue-100 scale-[1.02]'
                          : 'border-slate-400 bg-slate-50 text-slate-900 shadow-sm'
                        : 'border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200 hover:bg-white hover:text-gray-800',
                      count === 0 && !checked ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-black',
                        checked
                          ? isSelf
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-600 text-white'
                          : 'bg-white border border-gray-200 text-transparent',
                      ].join(' ')}
                      aria-hidden
                    >
                      ✓
                    </span>
                    {mgr}
                    {isSelf && (
                      <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                        나
                      </span>
                    )}
                    {realName && realName !== mgr && !isSelf && (
                      <span className="text-xs font-medium text-gray-400">{realName}</span>
                    )}
                    <span
                      className={[
                        'ml-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
                        checked ? 'bg-black/5' : 'text-gray-400',
                      ].join(' ')}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {optionalCategories.length > 0 && state.view === 'category' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 px-1">
            <span className="text-xs font-semibold text-gray-500 shrink-0">추가 표시</span>
            {optionalCategories.map(cat => {
              const count = optionalCategoryCounts.get(cat) ?? 0;
              const checked =
                state.optionalCategories.includes(cat) || searchRevealedCategories.includes(cat);
              const autoRevealed =
                searchRevealedCategories.includes(cat) && !state.optionalCategories.includes(cat);
              return (
                <label
                  key={cat}
                  className={`flex items-center gap-1.5 text-sm text-gray-700 ${count === 0 ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={autoRevealed}
                    onChange={e => toggleOptionalCategory(cat, e.target.checked)}
                    className="rounded"
                  />
                  {cat}
                  <span className="text-xs text-gray-400">({count})</span>
                  {autoRevealed && (
                    <span className="text-[10px] text-amber-600">검색</span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        {state.view === 'manager' ? (
          <ManagerRosterGrid
            clients={filtered}
            sort={state.sort}
            query={state.q}
            returnTo={returnTo}
            visibleManagers={state.visibleManagers}
            currentUserName={currentUserName}
            onColbertToggle={handleColbertToggle}
            onFeeChange={handleFeeChange}
          />
        ) : (
          <EntityPairGrid
            clients={filtered}
            sort={state.sort}
            query={state.q}
            returnTo={returnTo}
            mineOnly={state.mineOnly}
          />
        )}

        <p className="mt-4 text-sm text-gray-500 text-center">
          {totalCount}건 표시 · 행 클릭 시 상세
        </p>
      </main>
    </div>
  );
}
