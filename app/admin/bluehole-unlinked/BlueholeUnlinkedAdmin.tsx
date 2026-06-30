'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalAlertError,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalInput,
} from '@/app/components/portal/uiClasses';

type Row = {
  id: string;
  companyName: string;
  manager: string;
  representative: string;
  businessNo: string;
  businessEntityType: string;
  status: 'active' | 'churned';
};

type StatusFilter = 'active' | 'churned' | 'all';

const ENTITY_LABEL: Record<string, string> = {
  corporate: '법인',
  individual: '개인',
  nonBusiness: '비사업자',
};

export default function BlueholeUnlinkedAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/bluehole-unlinked', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '목록을 불러오지 못했습니다.');
      }
      const data = await res.json();
      setRows(data.clients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!text) return true;
      return (
        r.companyName.toLowerCase().includes(text) ||
        r.manager.toLowerCase().includes(text) ||
        r.representative.toLowerCase().includes(text) ||
        r.businessNo.replace(/\D/g, '').includes(text.replace(/\D/g, ''))
      );
    });
  }, [rows, q, statusFilter]);

  const activeCount = useMemo(() => rows.filter(r => r.status === 'active').length, [rows]);
  const churnedCount = rows.length - activeCount;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-gray-900">블루홀 미연결 수임처</h1>
        <p className="mt-1 text-sm text-gray-500">
          블루홀 거래처와 아직 연결되지 않은(blueholeClientId 없음) 수임처입니다. 블루홀에 등록·연결이 필요한 업체를 확인하세요.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="상호·담당·대표자·사업자번호 검색…"
            className={`${portalInput} flex-1 min-w-[12rem]`}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className={portalInput}
            aria-label="상태 필터"
          >
            <option value="active">수임 중 ({activeCount})</option>
            <option value="churned">해임 ({churnedCount})</option>
            <option value="all">전체 ({rows.length})</option>
          </select>
          <button type="button" onClick={() => void load()} className={portalBtnSecondary}>
            새로고침
          </button>
        </div>

        {error && <div className={`${portalAlertError} mt-4`}>{error}</div>}

        <div className={`${portalCard} mt-4 overflow-hidden`}>
          {loading ? (
            <p className="p-6 text-sm text-slate-500 text-center">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <div className={portalEmptyState}>
              {rows.length === 0 ? '미연결 수임처가 없습니다.' : '조건에 맞는 업체가 없습니다.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map(r => (
                <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/clients?focus=${r.id}`}
                        className="font-medium text-slate-900 hover:text-blue-700 hover:underline truncate"
                      >
                        {r.companyName}
                      </Link>
                      {r.status === 'churned' && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          해임
                        </span>
                      )}
                      {ENTITY_LABEL[r.businessEntityType] && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {ENTITY_LABEL[r.businessEntityType]}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {r.manager && `${r.manager} · `}
                      {r.representative && `대표 ${r.representative} · `}
                      {r.businessNo || '사업자번호 없음'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          연결은 수임처 상세 화면 또는 블루홀 메뉴에서 진행합니다. 총 {filtered.length}건 표시.
        </p>
      </main>
    </div>
  );
}
