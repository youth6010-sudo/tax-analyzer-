'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '../components/AppHeader';
import EntityPairGrid from '../components/clients/EntityPairGrid';
import type { ClientRecord } from '../types/client';
import { hydratePortal } from '@/app/utils/portalStore';
import {
  ALWAYS_VISIBLE_CATEGORIES,
  filterClientsByCategoryVisibility,
  getClientCategory,
  getOptionalCategories,
} from '@/app/utils/clientsGrouping';
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

  const [clients, setClients] = useState<ClientRecord[]>([]);

  const state: ClientsListState = urlState;

  useEffect(() => {
    hydratePortal();
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

  const updateState = useCallback(
    (patch: Partial<ClientsListState>, opts?: { includeScroll?: boolean }) => {
      const next = { ...state, ...patch, scroll: opts?.includeScroll ? window.scrollY : 0 };
      router.replace(buildClientsListUrl(next, { includeScroll: opts?.includeScroll }), { scroll: false });
    },
    [router, state],
  );

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
              {state.mineOnly
                ? '더존 export 기준 · 업체명 / 사업자번호 / 주민번호 / 전화'
                : '더존 export 기준 · 업체명 / 사업자번호 / 주민번호 / 전화 · 담당자 구분'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="search"
            value={state.q}
            onChange={e => updateState({ q: e.target.value })}
            placeholder="업체·대표·사업자번호·전화·담당자 검색"
            className="flex-1 min-w-[200px] max-w-md border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
          />
          <select
            value={state.sort}
            onChange={e => updateState({ sort: e.target.value as 'name' | 'code' })}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
          >
            <option value="name">이름순</option>
            <option value="code">세무사랑 코드순</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
            <input
              type="checkbox"
              checked={state.mineOnly}
              onChange={e => updateState({ mineOnly: e.target.checked, manager: '' })}
              className="rounded"
            />
            내 담당만
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
            <input
              type="checkbox"
              checked={state.includeChurned}
              onChange={e => updateState({ includeChurned: e.target.checked })}
              className="rounded"
            />
            폐업·해임 포함
          </label>
        </div>

        {optionalCategories.length > 0 && (
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

        <EntityPairGrid
          clients={filtered}
          sort={state.sort}
          query={state.q}
          returnTo={returnTo}
          mineOnly={state.mineOnly}
        />

        <p className="mt-4 text-xs text-gray-400 text-center">
          {totalCount}건 표시 · 행 클릭 시 상세
        </p>
      </main>
    </div>
  );
}
