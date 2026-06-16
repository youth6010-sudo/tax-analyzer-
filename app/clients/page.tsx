'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import ClientExpandableCard from '../components/ClientExpandableCard';
import type { ClientRecord } from '../types/client';
import { BUSINESS_ENTITY_TYPES } from '../types/contact';
import {
  getPortalClients,
  getPortalSearchIndex,
  hydratePortal,
  prefetchPortal,
  searchPortalClients,
  subscribePortal,
} from '@/app/utils/portalStore';

export default function ClientsPage() {
  const [entity, setEntity] = useState('');
  const [mineOnly, setMineOnly] = useState(true);
  const [clients, setClients] = useState<ClientRecord[]>(() => getPortalClients());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'fee'>('name');

  useEffect(() => {
    if (!clients.length) hydratePortal();
    return subscribePortal(() => setClients(getPortalClients()));
  }, [clients.length]);

  const load = useCallback(async () => {
    if (mineOnly && !entity) {
      await prefetchPortal(false);
      setClients(getPortalClients());
      return;
    }
    const params = new URLSearchParams({ status: 'active' });
    if (mineOnly) params.set('mine', '1');
    if (entity) params.set('entity', entity);
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    setClients(data.clients ?? []);
  }, [entity, mineOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) {
      const list = [...clients];
      if (sort === 'name') {
        list.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
      } else {
        list.sort((a, b) => (b.feeSummary ?? 0) - (a.feeSummary ?? 0));
      }
      return list;
    }

    const indexHits = mineOnly && !entity && getPortalSearchIndex().length > 0
      ? searchPortalClients(q, { activeOnly: true })
      : [];
    const base = indexHits.length > 0 ? indexHits : clients;
    const qLower = q.toLowerCase();
    const digits = q.replace(/\D/g, '');

    let list = base.filter(c => {
      const hay = [
        c.companyName,
        c.representative,
        c.manager,
        c.phone,
        c.businessNo,
        c.primaryContactName ?? '',
      ].join(' ').toLowerCase();
      if (hay.includes(qLower)) return true;
      if (digits.length >= 2) {
        const biz = c.businessNo.replace(/\D/g, '');
        const phone = c.phone.replace(/\D/g, '');
        return biz.includes(digits) || phone.includes(digits);
      }
      return false;
    });

    if (sort === 'name') {
      list.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
    } else {
      list.sort((a, b) => (b.feeSummary ?? 0) - (a.feeSummary ?? 0));
    }
    return list;
  }, [clients, search, sort, mineOnly, entity]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">수임처 관리</h1>
            <p className="text-sm text-gray-600 mt-1">더존 export 기준 · active 수임처</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="업체·대표·사업자번호·전화·담당자 검색"
            className="flex-1 min-w-[200px] max-w-md border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'name' | 'fee')}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
          >
            <option value="name">이름순</option>
            <option value="fee">기장료순</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={e => setMineOnly(e.target.checked)}
              className="rounded"
            />
            내 담당만
          </label>
          <select
            value={entity}
            onChange={e => setEntity(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">전체 구분</option>
            {BUSINESS_ENTITY_TYPES.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">표시할 수임처가 없습니다.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map(c => (
              <ClientExpandableCard key={c.id} client={c} query={search} asLink />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400 text-center">
          {filtered.length}건 표시 · 더보기로 상세 정보 확인
        </p>
      </main>
    </div>
  );
}
