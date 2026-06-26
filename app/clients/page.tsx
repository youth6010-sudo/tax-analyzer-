'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ManagerRosterGrid from '../components/clients/ManagerRosterGrid';
import ManagerChips from '../components/clients/ManagerChips';
import PortalPageShell, { PortalLoading } from '../components/portal/PortalPageShell';
import {
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
import { useLocalStorage } from '@/app/tools/notice-generator/_lib/useLocalStorage';

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
  // 담당자 표시 순서(사용자가 자유롭게 변경 · 브라우저에 저장)
  const [managerOrder, setManagerOrder] = useLocalStorage<string[]>(
    'clients.managerOrder.v1',
    [...MANAGER_DISPLAY_ORDER],
  );

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
    updateState({ visibleManagers: [currentUserName], mineOnly: false });
  }, [currentUserName, searchParams, updateState]);

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

  const compareByOrder = useCallback(
    (a: string, b: string) => {
      if (a === UNCategorized) return 1;
      if (b === UNCategorized) return -1;
      const ia = managerOrder.indexOf(a);
      const ib = managerOrder.indexOf(b);
      const ra = ia >= 0 ? ia : Number.MAX_SAFE_INTEGER;
      const rb = ib >= 0 ? ib : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, 'ko');
    },
    [managerOrder],
  );

  const managerOptions = useMemo(() => {
    const set = new Set<string>(MANAGER_DISPLAY_ORDER);
    for (const c of filtered) {
      set.add(c.manager?.trim() || UNCategorized);
    }
    return [...set].sort(compareByOrder);
  }, [filtered, compareByOrder]);

  /** 로스터에 넘길 담당자 목록 — 사용자가 지정한 순서대로 */
  const orderedVisibleManagers = useMemo(
    () => [...state.visibleManagers].sort(compareByOrder),
    [state.visibleManagers, compareByOrder],
  );

  const managerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filtered) {
      const mgr = c.manager?.trim() || UNCategorized;
      counts.set(mgr, (counts.get(mgr) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

  /** 담당자 탭 → 선택/해제(다중 선택) */
  const toggleManager = useCallback(
    (manager: string) => {
      const set = new Set(state.visibleManagers);
      if (set.has(manager)) set.delete(manager);
      else set.add(manager);
      updateState({ visibleManagers: [...set], mineOnly: false, manager: '' });
    },
    [state.visibleManagers, updateState],
  );

  const selectAllManagers = useCallback(() => {
    updateState({ visibleManagers: [...managerOptions], mineOnly: false, manager: '' });
  }, [managerOptions, updateState]);

  const clearManagers = useCallback(() => {
    updateState({ visibleManagers: [], mineOnly: false, manager: '' });
  }, [updateState]);

  /** 내 담당 빠른 선택 */
  const selectMine = useCallback(() => {
    if (!currentUserName) return;
    updateState({ visibleManagers: [currentUserName], mineOnly: false, manager: '' });
  }, [currentUserName, updateState]);

  const isMineOnlySelected =
    !!currentUserName &&
    state.visibleManagers.length === 1 &&
    state.visibleManagers[0] === currentUserName;

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
            checked={state.includeChurned}
            onChange={e => updateState({ includeChurned: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
          />
          폐업·해임
        </label>
      </div>

      <div className={`${portalCard} shrink-0 mb-2 px-3 py-2.5 space-y-2`}>
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs font-semibold text-slate-500">담당자</span>
            <span className="text-[10px] text-slate-400">탭 = 선택/해제(다중) · 꾹 눌러 드래그하면 순서 변경</span>
            <span className="ml-auto flex flex-wrap gap-1">
              {currentUserName && (
                <button
                  type="button"
                  onClick={selectMine}
                  className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px] ${
                    isMineOnlySelected ? '!border-blue-300 !bg-blue-50 !text-blue-700' : ''
                  }`}
                >
                  내 담당
                </button>
              )}
              <button type="button" onClick={selectAllManagers} className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px]`}>
                전체
              </button>
              <button type="button" onClick={clearManagers} className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px]`}>
                해제
              </button>
            </span>
          </div>
          <ManagerChips
            managers={managerOptions}
            counts={managerCounts}
            selected={state.visibleManagers}
            currentUserName={currentUserName}
            onToggle={toggleManager}
            onReorder={setManagerOrder}
          />
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
            visibleManagers={orderedVisibleManagers}
            visibleOptionalCategories={state.visibleOptionalCategories}
            currentUserName={currentUserName}
            onFeeChange={handleFeeChange}
          feeRefreshKeys={feeRefreshKeys}
        />
      )}
    </PortalPageShell>
  );
}
