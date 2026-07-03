'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PortalPageShell, { PortalLoading } from '@/app/components/portal/PortalPageShell';
import { portalCard, portalInput, portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type { ClientRecord } from '@/app/types/client';
import {
  CLIENT_MAIN_CATEGORIES,
  getClientCategory,
  getClientCategoryForFilter,
  getClientDouzoneCode,
} from '@/app/utils/clientsGrouping';
import { buildBizNoDuplicateCounts, isDuplicateBizNoClient } from '@/app/utils/clientBizNo';
import { formatBusinessNo } from '@/app/utils/idFormat';
import { buildClientDetailUrl } from '@/app/utils/clientsListState';

function formatDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function ClientsDirectoryPage() {
  return (
    <Suspense
      fallback={
        <PortalPageShell>
          <PortalLoading />
        </PortalPageShell>
      }
    >
      <ClientsDirectoryContent />
    </Suspense>
  );
}

function ClientsDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [duplicatesOnly, setDuplicatesOnly] = useState(searchParams.get('dup') === '1');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('catFilter') ?? '');
  const [includeChurned, setIncludeChurned] = useState(searchParams.get('includeChurned') === '1');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mine: '0' });
      if (includeChurned) params.set('includeChurned', '1');
      const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
      const data = await res.json();
      setClients((data.clients as ClientRecord[]) ?? []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [includeChurned]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (duplicatesOnly) p.set('dup', '1');
    if (categoryFilter) p.set('catFilter', categoryFilter);
    if (includeChurned) p.set('includeChurned', '1');
    const qs = p.toString();
    router.replace(qs ? `/clients/directory?${qs}` : '/clients/directory', { scroll: false });
  }, [q, duplicatesOnly, categoryFilter, includeChurned, router]);

  const bizNoCounts = useMemo(() => buildBizNoDuplicateCounts(clients), [clients]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');

    return clients.filter(c => {
      if (categoryFilter && getClientCategoryForFilter(c) !== categoryFilter) return false;
      if (duplicatesOnly && !isDuplicateBizNoClient(c, bizNoCounts)) return false;
      if (!query) return true;

      const hay = [c.companyName, c.representative, c.manager, c.businessNo, getClientDouzoneCode(c)]
        .join(' ')
        .toLowerCase();
      if (hay.includes(query)) return true;
      if (digits.length >= 2) {
        const biz = c.businessNo.replace(/\D/g, '');
        return biz.includes(digits);
      }
      return false;
    });
  }, [clients, q, categoryFilter, duplicatesOnly, bizNoCounts]);

  const duplicateTotal = useMemo(
    () => clients.filter(c => isDuplicateBizNoClient(c, bizNoCounts)).length,
    [clients, bizNoCounts],
  );

  const returnTo = '/clients/directory';

  return (
    <PortalPageShell className="!py-3 lg:!py-4">
      <div className="mb-4 space-y-1">
        <h1 className="text-lg font-bold text-slate-900 sm:text-xl">수임처 목록</h1>
        <p className="text-xs text-slate-500">
          전체 거래처 검색 · 번호 쌍 기준 중복 확인 (법인: 사업자+법인등록 / 개인·비사업자: 사업자+주민) ({clients.length}건
          {duplicateTotal > 0 ? ` · 중복 의심 ${duplicateTotal}건` : ''})
        </p>
      </div>

      <div className={`${portalCard} mb-3 flex flex-wrap items-center gap-2 p-2.5`}>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="상호·사업자번호·담당자·코드 검색"
          className={`${portalInput} min-w-[12rem] flex-1 text-sm`}
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className={`${portalInput} !w-auto text-sm`}
        >
          <option value="">대분류 전체</option>
          {CLIENT_MAIN_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={duplicatesOnly}
            onChange={e => setDuplicatesOnly(e.target.checked)}
            className="rounded border-slate-300 text-amber-600"
          />
          중복만
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={includeChurned}
            onChange={e => setIncludeChurned(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          해임 포함
        </label>
        <button type="button" onClick={() => void load()} className={`${portalBtnSecondary} !py-1.5 text-xs`}>
          새로고침
        </button>
      </div>

      <div className={`${portalCard} overflow-hidden`}>
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-semibold">상호</th>
                  <th className="px-3 py-2 font-semibold">사업자번호</th>
                  <th className="px-3 py-2 font-semibold">대분류</th>
                  <th className="px-3 py-2 font-semibold">담당</th>
                  <th className="px-3 py-2 font-semibold">등록일</th>
                  <th className="px-3 py-2 font-semibold">코드</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const dup = isDuplicateBizNoClient(c, bizNoCounts);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/80 ${
                        dup ? 'bg-amber-50/40' : ''
                      } ${c.status === 'churned' ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Link
                            href={buildClientDetailUrl(c.id, returnTo)}
                            className={`truncate font-semibold hover:underline ${
                              dup ? 'text-amber-900' : 'text-slate-800'
                            }`}
                          >
                            {c.companyName || '(이름 없음)'}
                          </Link>
                          {dup && (
                            <span className="shrink-0 rounded bg-amber-200 px-1.5 py-px text-[10px] font-bold text-amber-900">
                              중복
                            </span>
                          )}
                          {c.status === 'churned' && (
                            <span className="shrink-0 rounded bg-slate-200 px-1.5 py-px text-[10px] font-bold text-slate-600">
                              해임
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                        {c.businessNo ? formatBusinessNo(c.businessNo) : '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{getClientCategory(c)}</td>
                      <td className="px-3 py-2 text-slate-600">{c.manager?.trim() || '미지정'}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">{getClientDouzoneCode(c) || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <p className="border-t border-slate-100 px-3 py-2 text-right text-xs text-slate-400">
            {filtered.length}건 표시
          </p>
        )}
      </div>
    </PortalPageShell>
  );
}
