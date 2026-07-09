'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ManagerRosterGrid from '../components/clients/ManagerRosterGrid';
import ManagerChips from '../components/clients/ManagerChips';
import FeeInvoiceImportButton, { type FeeImportMatch } from '../components/clients/FeeInvoiceImportButton';
import FeeExportButton from '../components/clients/FeeExportButton';
import PortalPageShell, { PortalLoading } from '../components/portal/PortalPageShell';
import {
  portalBtnSecondary,
  portalCard,
  portalInput,
} from '../components/portal/uiClasses';
import type { ClientRecord } from '../types/client';
import {
  getPortalClients,
  hydratePortal,
  markPortalClientsFresh,
  patchPortalClient,
  subscribePortal,
  usePortalClients,
} from '@/app/utils/portalStore';
import {
  MANAGER_DISPLAY_ORDER,
  UNCategorized,
  CLIENT_MAIN_CATEGORIES,
  countClientsByMainCategory,
  countMainCategoryClients,
  matchesCategoryFilter,
  SINGO_DAERI,
  JISUTAEK_CATEGORY,
  UNUSED_CATEGORY,
} from '@/app/utils/clientsGrouping';
import type { FeeBreakdownSave } from '@/app/utils/feeBreakdown';
import { feeItemsEqual, readFeeItems } from '@/app/utils/feeBreakdown';
import {
  buildClientsListUrl,
  DEFAULT_CATEGORY_FILTERS,
  parseClientsListState,
  type ClientsListState,
} from '@/app/utils/clientsListState';
import { useLocalStorage } from '@/app/tools/notice-generator/_lib/useLocalStorage';
import { writeClientSort, MANAGER_CLIENT_ORDER_STORAGE_KEY } from '@/app/utils/clientListPrefs';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import {
  readCorpFeeClientCache,
  writeCorpFeeClientCache,
} from '@/app/utils/corpFeeClientCache';
import type { CorpFeeEntry } from '@/lib/review/corpFeeTypes';
import { buildCorpRevenueByClientId } from '@/lib/review/corpFeeTypes';

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
  const defaultCatApplied = useRef(false);

  const cachedClients = usePortalClients();
  const [fetchedClients, setFetchedClients] = useState<ClientRecord[] | null>(() => {
    if (typeof window === 'undefined') return null;
    const portal = getPortalClients();
    return portal.length > 0 ? portal : null;
  });
  const [fetching, setFetching] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [canEditAll, setCanEditAll] = useState(false);
  const [feeRefreshKeys, setFeeRefreshKeys] = useState<Record<string, number>>({});
  const [corpFeeByKey, setCorpFeeByKey] = useState<Record<string, CorpFeeEntry>>(() => {
    const cached = readCorpFeeClientCache();
    return cached?.byKey ?? {};
  });
  const [primaryLinksByKey, setPrimaryLinksByKey] = useState<Record<string, string>>(() => {
    const cached = readCorpFeeClientCache();
    return cached?.primaryLinksByKey ?? {};
  });
  const [clientOrderVersion, setClientOrderVersion] = useState(0);
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
    return subscribePortal(() => {
      setFetchedClients(prev => {
        if (!prev) return prev;
        const portalById = new Map(getPortalClients().map(c => [c.id, c]));
        return prev.map(c => {
          const patched = portalById.get(c.id);
          return patched ? { ...c, ...patched } : c;
        });
      });
    });
  }, []);

  useEffect(() => {
    const key = `local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`;
    const onStorage = () => setClientOrderVersion(v => v + 1);
    window.addEventListener(key, onStorage);
    return () => window.removeEventListener(key, onStorage);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) setCurrentUserName(String(data.user.name).trim());
        if (data?.isMaster) setCanEditAll(true);
      })
      .catch(() => {});
  }, []);

  const loadCorpFeeIndex = useCallback(async () => {
    const cached = readCorpFeeClientCache();
    if (cached) {
      setCorpFeeByKey(cached.byKey);
      setPrimaryLinksByKey(cached.primaryLinksByKey);
      return;
    }
    try {
      const res = await fetch('/api/review/corp-fee-index', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const byKey = (data.byKey ?? {}) as Record<string, CorpFeeEntry>;
      const primary = (data.primaryLinksByKey ?? {}) as Record<string, string>;
      setCorpFeeByKey(byKey);
      setPrimaryLinksByKey(primary);
      writeCorpFeeClientCache(byKey, primary);
    } catch {
      /* 검토표 미배포 시 무시 */
    }
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (state.mineOnly) params.set('mine', '1');
    if (state.includeChurned) params.set('includeChurned', '1');
    setFetching(true);
    try {
      const res = await fetch(`/api/clients?${params}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      });
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
            !feeItemsEqual(readFeeItems(old.intakeData), readFeeItems(c.intakeData));
          if (!feeChangedLocally) return c;
          return {
            ...c,
            feeSummary: old.feeSummary,
            intakeData: {
              ...c.intakeData,
              bookkeepingFee: old.intakeData?.bookkeepingFee,
              adjustmentFee: old.intakeData?.adjustmentFee,
            },
            updatedAt: old.updatedAt,
          };
        });
      });
    } catch {
      setFetchedClients(prev => {
        if (prev && prev.length > 0) return prev;
        const cached = getPortalClients();
        return cached.length > 0 ? cached : [];
      });
    } finally {
      setFetching(false);
    }
  }, [state.mineOnly, state.includeChurned]);

  useEffect(() => {
    void load();
    void loadCorpFeeIndex();
  }, [load, loadCorpFeeIndex]);

  const handleFeeImported = useCallback(
    (matched: FeeImportMatch[]) => {
      if (matched.length > 0) {
        const byId = new Map(matched.map(m => [m.clientId, m]));
        setFetchedClients(list => {
          const base = list ?? getPortalClients();
          return base.map(c => {
            const hit = byId.get(c.id);
            if (!hit) return c;
            const patched: ClientRecord = {
              ...c,
              feeSummary: hit.feeSummary,
              intakeData: {
                ...c.intakeData,
                feeItems: hit.feeItems,
                bookkeepingFee: null,
                adjustmentFee: null,
                feeItemsBaselineAt: new Date().toISOString(),
              },
            };
            patchPortalClient(c.id, patched);
            return patched;
          });
        });
        setFeeRefreshKeys(k => {
          const next = { ...k };
          for (const m of matched) next[m.clientId] = (next[m.clientId] ?? 0) + 1;
          return next;
        });
        markPortalClientsFresh();
      }
      void load();
    },
    [load],
  );

  const handleFeeChange = useCallback(async (id: string, payload: FeeBreakdownSave) => {
    let prevClient: ClientRecord | undefined;

    const applyFeePatch = (c: ClientRecord): ClientRecord => ({
      ...c,
      feeSummary: payload.feeSummary,
      intakeData: {
        ...c.intakeData,
        feeItems: payload.feeItems,
        bookkeepingFee: null,
        adjustmentFee: null,
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
          feeItems: payload.feeItems,
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
      if (patch.sort) writeClientSort(patch.sort);
      const next = { ...state, ...patch, scroll: opts?.includeScroll ? window.scrollY : 0 };
      router.replace(buildClientsListUrl(next, { includeScroll: opts?.includeScroll }), { scroll: false });
    },
    [router, state],
  );

  useEffect(() => {
    writeClientSort(state.sort);
  }, [state.sort]);

  /** URL에 catFilter 없을 때 개인·법인 기본 적용 */
  useEffect(() => {
    if (defaultCatApplied.current) return;
    const catParam = searchParams.get('catFilter');
    if (catParam === 'all' || catParam) {
      defaultCatApplied.current = true;
      return;
    }
    defaultCatApplied.current = true;
    updateState({ categoryFilters: [...DEFAULT_CATEGORY_FILTERS] });
  }, [searchParams, updateState]);

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

  const listBeforeCategoryFilter = useMemo(() => {
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
  }, [clients, state.q, state.manager]);

  const filtered = useMemo(() => {
    if (state.categoryFilters.length === 0) return listBeforeCategoryFilter;
    return listBeforeCategoryFilter.filter(c => matchesCategoryFilter(c, state.categoryFilters));
  }, [listBeforeCategoryFilter, state.categoryFilters]);

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

  const categoryCounts = useMemo(
    () => countClientsByMainCategory(listBeforeCategoryFilter),
    [listBeforeCategoryFilter],
  );

  const toggleCategoryFilter = useCallback(
    (category: string, checked: boolean) => {
      const next = checked
        ? [...new Set([...state.categoryFilters, category])]
        : state.categoryFilters.filter(c => c !== category);
      updateState({ categoryFilters: next });
    },
    [state.categoryFilters, updateState],
  );

  const selectAllCategoryFilters = useCallback(() => {
    updateState({ categoryFilters: [...CLIENT_MAIN_CATEGORIES] });
  }, [updateState]);

  const clearCategoryFilters = useCallback(() => {
    updateState({ categoryFilters: [] });
  }, [updateState]);

  const rosterOptionalCategories = useMemo(
    () => [SINGO_DAERI, JISUTAEK_CATEGORY, UNUSED_CATEGORY],
    [],
  );

  const mainStats = useMemo(() => countMainCategoryClients(filtered), [filtered]);
  const feeExportClients = useMemo(() => {
    if (canEditAll || !currentUserName) return filtered;
    const mine = new Set(getManagerMatchNames(currentUserName));
    return filtered.filter(c => mine.has((c.manager ?? '').trim()));
  }, [filtered, canEditAll, currentUserName]);
  const corpRevenueByClientId = useMemo(
    () => buildCorpRevenueByClientId(clients, corpFeeByKey, primaryLinksByKey),
    [clients, corpFeeByKey, primaryLinksByKey],
  );
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
    <PortalPageShell className="!py-3 lg:!py-4">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 mb-2 bg-[var(--background)]/95 backdrop-blur-sm border-b border-slate-200/80 space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200/60 pb-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">수임처 관리</h1>
          <p className="text-xs text-slate-500 mt-0.5">← → 버튼 또는 가로 스크롤 · 상호 꾹 눌러 순서 변경 · 업체명 클릭으로 정보 표시 · 수수료 더블클릭으로 수정</p>
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
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 ring-1 ring-slate-200">
          {(['name', 'code'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => updateState({ sort: key })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                state.sort === key
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {key === 'name' ? '상호순' : '코드순'}
            </button>
          ))}
        </div>
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
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs font-semibold text-slate-500">대분류</span>
            <span className="text-[10px] text-slate-400">기본 개인·법인 · 비어 있으면 전체</span>
            <button
              type="button"
              onClick={selectAllCategoryFilters}
              className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px] ml-auto`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={clearCategoryFilters}
              className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px]`}
            >
              해제
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {CLIENT_MAIN_CATEGORIES.map(cat => {
              const count = categoryCounts.get(cat) ?? 0;
              const active =
                state.categoryFilters.length > 0 && state.categoryFilters.includes(cat);
              const highlight = active;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategoryFilter(cat, !active)}
                  className={[compactChip(highlight), count === 0 && !highlight ? 'opacity-40' : ''].join(' ')}
                >
                  {cat}
                  <span className={compactChipCount(highlight)}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <FeeInvoiceImportButton allowed={canEditAll} onImported={handleFeeImported} />
        <FeeExportButton clients={feeExportClients} corpRevenueByClientId={corpRevenueByClientId} />
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
            visibleOptionalCategories={rosterOptionalCategories}
            currentUserName={currentUserName}
            isAdmin={canEditAll}
            onFeeChange={handleFeeChange}
          feeRefreshKeys={feeRefreshKeys}
          corpRevenueByClientId={corpRevenueByClientId}
          orderVersion={clientOrderVersion}
          onClientOrderChange={() => setClientOrderVersion(v => v + 1)}
        />
      )}
    </PortalPageShell>
  );
}
