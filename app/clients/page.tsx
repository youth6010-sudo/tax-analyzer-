'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ManagerRosterGrid from '../components/clients/ManagerRosterGrid';
import PortalPageShell, { PortalLoading } from '../components/portal/PortalPageShell';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalInput,
  portalSelect,
} from '../components/portal/uiClasses';
import type { ClientRecord } from '../types/client';
import {
  getPortalClients,
  hydratePortal,
  markPortalClientsFresh,
  patchPortalClient,
  usePortalClients,
} from '@/app/utils/portalStore';
import {
  MANAGER_DISPLAY_ORDER,
  UNCategorized,
  ALWAYS_VISIBLE_CATEGORIES,
  collectOptionalCategories,
  countMainCategoryClients,
  getClientCategory,
} from '@/app/utils/clientsGrouping';
import type { FeeBreakdownSave } from '@/app/utils/feeBreakdown';
import {
  buildClientsListUrl,
  parseClientsListState,
  type ClientsListState,
} from '@/app/utils/clientsListState';

export default function ClientsPage() {
  return (
    <Suspense fallback={
      <PortalPageShell>
        <PortalLoading />
      </PortalPageShell>
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

  const cachedClients = usePortalClients();
  const [fetchedClients, setFetchedClients] = useState<ClientRecord[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [feeRefreshKeys, setFeeRefreshKeys] = useState<Record<string, number>>({});

  const clients = fetchedClients ?? cachedClients;
  const loading = fetchedClients === null && cachedClients.length === 0;

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
    setFetching(true);
    try {
      const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
      const data = await res.json();
      const incoming: ClientRecord[] = data.clients ?? [];
      setFetchedClients(prev => {
        if (!prev) return incoming;
        const prevById = new Map(prev.map(c => [c.id, c]));
        return incoming.map(c => {
          const old = prevById.get(c.id);
          if (!old) return c;
          const serverTime = Date.parse(c.updatedAt) || 0;
          const localTime = Date.parse(old.updatedAt) || 0;
          if (serverTime >= localTime) return c;
          const feeChangedLocally =
            old.feeSummary !== c.feeSummary ||
            old.intakeData?.bookkeepingFee !== c.intakeData?.bookkeepingFee ||
            old.intakeData?.adjustmentFee !== c.intakeData?.adjustmentFee;
          return feeChangedLocally ? old : c;
        });
      });
    } finally {
      setFetching(false);
    }
  }, [state.mineOnly, state.includeChurned]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFeeChange = useCallback(async (id: string, payload: FeeBreakdownSave) => {
    let prevClient: ClientRecord | undefined;

    const applyFeePatch = (c: ClientRecord): ClientRecord => ({
      ...c,
      feeSummary: payload.feeSummary,
      intakeData: {
        ...c.intakeData,
        bookkeepingFee: payload.bookkeepingFee,
        adjustmentFee: payload.adjustmentFee,
      },
    });

    setFetchedClients(list => {
      const base = list ?? getPortalClients();
      prevClient = base.find(c => c.id === id);
      if (!prevClient) return list;
      return base.map(c => (c.id === id ? applyFeePatch(c) : c));
    });

    if (prevClient) {
      patchPortalClient(id, applyFeePatch(prevClient));
    }

    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          bookkeepingFee: payload.bookkeepingFee,
          adjustmentFee: payload.adjustmentFee,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');

      setFetchedClients(list => {
        const base = list ?? getPortalClients();
        const hasClient = base.some(c => c.id === id);
        if (!hasClient) return [...base, data.client];
        return base.map(c => (c.id === id ? data.client : c));
      });
      patchPortalClient(id, data.client);
      markPortalClientsFresh();
      setFeeRefreshKeys(k => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
    } catch (e) {
      if (prevClient) {
        setFetchedClients(list => {
          const base = list ?? getPortalClients();
          return base.map(c => (c.id === id ? prevClient! : c));
        });
        patchPortalClient(id, prevClient);
      }
      const msg = e instanceof Error ? e.message : '수수료 저장에 실패했습니다.';
      alert(msg === 'Forbidden' ? '이 수임처를 수정할 권한이 없습니다.' : `수수료 저장에 실패했습니다.\n${msg}`);
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
    if (searchParams.get('mgr')) return;
    if (!currentUserName) return;
    defaultMgrApplied.current = true;
    updateState({ visibleManagers: [currentUserName], mineOnly: true });
  }, [currentUserName, searchParams, updateState]);

  /** 내 담당만 켜져 있으면 담당자 선택도 본인만 */
  useEffect(() => {
    if (!state.mineOnly || !currentUserName) return;
    const onlySelf =
      state.visibleManagers.length === 1 && state.visibleManagers[0] === currentUserName;
    if (onlySelf) return;
    updateState({ visibleManagers: [currentUserName] });
  }, [state.mineOnly, state.visibleManagers, currentUserName, updateState]);

  useEffect(() => {
    if (scrollRestored.current || state.scroll <= 0) return;
    scrollRestored.current = true;
    requestAnimationFrame(() => {
      window.scrollTo(0, state.scroll);
    });
  }, [state.scroll]);

  const filtered = useMemo(() => {
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

  const managerOptions = useMemo(() => {
    const set = new Set<string>(MANAGER_DISPLAY_ORDER);
    for (const c of filtered) {
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
  }, [filtered]);

  const managerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filtered) {
      const mgr = c.manager?.trim() || UNCategorized;
      counts.set(mgr, (counts.get(mgr) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

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
    updateState({ visibleManagers: [], mineOnly: false });
  }, [updateState]);

  const applyMineOnly = useCallback(
    (checked: boolean) => {
      if (checked && currentUserName) {
        updateState({ mineOnly: true, visibleManagers: [currentUserName], manager: '' });
      } else {
        updateState({ mineOnly: false, manager: '' });
      }
    },
    [currentUserName, updateState],
  );

  const optionalCategoryOptions = useMemo(
    () => collectOptionalCategories(filtered),
    [filtered],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filtered) {
      const cat = getClientCategory(c);
      if (ALWAYS_VISIBLE_CATEGORIES.has(cat)) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

  const toggleOptionalCategory = useCallback(
    (category: string, checked: boolean) => {
      const next = checked
        ? [...new Set([...state.visibleOptionalCategories, category])]
        : state.visibleOptionalCategories.filter(c => c !== category);
      updateState({ visibleOptionalCategories: next });
    },
    [state.visibleOptionalCategories, updateState],
  );

  const selectAllOptionalCategories = useCallback(() => {
    updateState({ visibleOptionalCategories: [...optionalCategoryOptions] });
  }, [optionalCategoryOptions, updateState]);

  const clearOptionalCategories = useCallback(() => {
    updateState({ visibleOptionalCategories: [] });
  }, [updateState]);

  const mainStats = useMemo(() => countMainCategoryClients(filtered), [filtered]);
  const returnTo = buildClientsListUrl({ ...state, scroll: 0 });

  const filterSummary = [
    `담당 ${state.visibleManagers.length}`,
    state.visibleOptionalCategories.length > 0
      ? `대분류 ${state.visibleOptionalCategories.length}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const compactChip = (active: boolean, self?: boolean) =>
    [
      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors',
      active
        ? self
          ? 'border-blue-300 bg-blue-50 text-blue-950'
          : 'border-slate-300 bg-slate-100 text-slate-900'
        : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100',
    ].join(' ');

  const compactChipCount = (active: boolean) =>
    [
      'tabular-nums text-[10px] font-semibold rounded px-1 py-px min-w-[1rem] text-center',
      active ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500',
    ].join(' ');

  return (
    <PortalPageShell staticHeader className="!py-3 lg:!py-4">
      <div className="shrink-0 mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">수임처 관리</h1>
          <p className="text-xs text-slate-500 mt-0.5">← → 버튼 또는 가로 스크롤 · 업체명 클릭으로 정보 표시</p>
        </div>
        <p className="text-xs text-slate-500 tabular-nums shrink-0">
          {fetching && clients.length > 0 ? '새로고침 중… · ' : ''}
          {mainStats.total}건
          <span className="text-slate-400"> (개인·법인)</span>
        </p>
      </div>

      <div className={`${portalCard} shrink-0 flex flex-wrap items-center gap-2 p-2.5 mb-2`}>
        <input
          type="search"
          value={state.q}
          onChange={e => updateState({ q: e.target.value })}
          placeholder="업체·대표·번호·담당자 검색"
          className={`${portalInput} !py-1.5 flex-1 min-w-[10rem] max-w-sm text-sm`}
        />
        <select
          value={state.sort}
          onChange={e => updateState({ sort: e.target.value as 'name' | 'code' })}
          className={`${portalSelect} !py-1.5 text-sm`}
        >
          <option value="name">이름순</option>
          <option value="code">코드순</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={state.mineOnly}
            onChange={e => applyMineOnly(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
          />
          내 담당
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={state.includeChurned}
            onChange={e => updateState({ includeChurned: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
          />
          폐업·해임
        </label>
      </div>

      <details className={`${portalCard} shrink-0 mb-2 group`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 select-none [&::-webkit-details-marker]:hidden">
          <span className="text-slate-400 transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
          <span>필터</span>
          <span className="text-xs font-normal text-slate-400">{filterSummary || '담당 0'}</span>
          <span className="ml-auto flex gap-1.5" onClick={e => e.preventDefault()}>
            <button type="button" onClick={selectAllManagers} className={`${portalBtnSecondary} !px-2 !py-1 text-xs`}>
              담당 전체
            </button>
            {currentUserName && (
              <button
                type="button"
                onClick={() => applyMineOnly(true)}
                className={`${portalBtnPrimary} !px-2 !py-1 text-xs`}
              >
                내 담당
              </button>
            )}
          </span>
        </summary>
        <div className="border-t border-slate-100 px-3 py-2 space-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className="text-xs font-semibold text-slate-500">담당자</span>
              <button type="button" onClick={clearManagers} className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px] ml-auto`}>
                해제
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {managerOptions.map(mgr => {
                const count = managerCounts.get(mgr) ?? 0;
                const checked = state.visibleManagers.includes(mgr);
                const isSelf = currentUserName === mgr;
                return (
                  <button
                    key={mgr}
                    type="button"
                    onClick={() => toggleVisibleManager(mgr, !checked)}
                    className={[compactChip(checked, isSelf), count === 0 && !checked ? 'opacity-40' : ''].join(' ')}
                  >
                    {mgr}
                    {isSelf && <span className="text-[9px] font-bold text-blue-600">나</span>}
                    <span className={compactChipCount(checked)}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {optionalCategoryOptions.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="text-xs font-semibold text-slate-500">대분류</span>
                <span className="text-[10px] text-slate-400">개인·법인 항상 표시</span>
                <button
                  type="button"
                  onClick={selectAllOptionalCategories}
                  className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px] ml-auto`}
                >
                  전체
                </button>
                <button
                  type="button"
                  onClick={clearOptionalCategories}
                  className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px]`}
                >
                  해제
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {optionalCategoryOptions.map(cat => {
                  const count = categoryCounts.get(cat) ?? 0;
                  const checked = state.visibleOptionalCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleOptionalCategory(cat, !checked)}
                      className={[compactChip(checked), count === 0 && !checked ? 'opacity-40' : ''].join(' ')}
                    >
                      {cat}
                      <span className={compactChipCount(checked)}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </details>

      {loading && clients.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className={`${portalCard} h-64 bg-slate-50`} />
        </div>
      ) : (
        <ManagerRosterGrid
            clients={filtered}
            sort={state.sort}
            query={state.q}
            returnTo={returnTo}
            visibleManagers={state.visibleManagers}
            visibleOptionalCategories={state.visibleOptionalCategories}
            currentUserName={currentUserName}
            onFeeChange={handleFeeChange}
          feeRefreshKeys={feeRefreshKeys}
        />
      )}
    </PortalPageShell>
  );
}
