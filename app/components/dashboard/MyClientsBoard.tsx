'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ClientRecord } from '@/app/types/client';
import { getClientCategory, getClientDouzoneCode, SINGO_DAERI } from '@/app/utils/clientsGrouping';
import {
  formatClientClosureDate,
  getClientClosureKind,
  groupClientsByClosureYear,
  isClosureReviewClient,
  type ClientWithChurn,
} from '@/app/utils/clientClosure';
import { CATEGORY_COLORS } from '@/app/utils/categoryColors';
import { useDashboardTaxFilter } from '@/app/utils/dashboardTaxFilter';
import { filingTargets, isVatSummaryOnlyClient, defaultPeriod, periodKey } from '@/app/utils/filingCheck';
import { clientNeedsNtsAttention } from '@/app/utils/churnMatch';
import { getPortalChurnRecords, getPortalClients, hydratePortal, subscribePortal } from '@/app/utils/portalStore';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import {
  CLIENT_SORT_STORAGE_KEY,
  applyManagerRosterDisplayOrder,
  commitClientListReorder,
  MANAGER_CLIENT_ORDER_STORAGE_KEY,
  readManagerClientOrder,
  type ClientSortKey,
} from '@/app/utils/clientListPrefs';
import { useLocalStorage } from '@/app/tools/notice-generator/_lib/useLocalStorage';
import { useLongPressListReorder } from '@/app/utils/useLongPressListReorder';

type SortKey = ClientSortKey;

const SHOW_SINGO_KEY = 'dashboard.showSingoDaeri';
const SHOW_JISUTAEK_KEY = 'dashboard.showJisutaek';
const INCLUDE_CHURNED_KEY = 'dashboard.includeChurned';

function compareByName(a: ClientRecord, b: ClientRecord): number {
  return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
}

// 코드(intakeData.douzoneCode = "코드") 순 — 비어있으면 뒤로
function compareByCode(a: ClientRecord, b: ClientRecord): number {
  const ca = getClientDouzoneCode(a);
  const cb = getClientDouzoneCode(b);
  if (!ca && !cb) return compareByName(a, b);
  if (!ca) return 1;
  if (!cb) return -1;
  const da = ca.replace(/\D/g, '');
  const db = cb.replace(/\D/g, '');
  if (da && db) return parseInt(da, 10) - parseInt(db, 10);
  return ca.localeCompare(cb, 'ko', { numeric: true });
}

function ClientList({
  clients,
  excludedIds,
  summaryIds,
  ntsClosedIds,
  ntsOverride,
  showClosureMeta = false,
  managerName,
  allClients,
  sort,
  onOrderChange,
}: {
  clients: ClientWithChurn[];
  excludedIds: Set<string>;
  summaryIds: Set<string>;
  ntsClosedIds: Set<string>;
  ntsOverride: Record<string, string>;
  showClosureMeta?: boolean;
  managerName: string | null;
  allClients: ClientWithChurn[];
  sort: SortKey;
  onOrderChange: () => void;
}) {
  const ids = useMemo(() => clients.map(c => c.id), [clients]);
  const handleCommit = useCallback(
    (nextIds: string[]) => {
      if (!managerName) return;
      commitClientListReorder(managerName, nextIds, allClients, sort);
      onOrderChange();
    },
    [managerName, allClients, sort, onOrderChange],
  );
  const { orderedIds, getItemProps, consumeClick } = useLongPressListReorder(ids, handleCommit);
  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const displayClients = orderedIds
    .map(id => byId.get(id))
    .filter((c): c is ClientWithChurn => !!c);

  if (clients.length === 0) {
    return <p className="px-1 py-5 text-center text-sm text-slate-400">담당 수임처가 없습니다.</p>;
  }
  return (
    <ol className="divide-y divide-slate-100">
      {displayClients.map((c, i) => {
        const excluded = excludedIds.has(c.id);
        const summary = summaryIds.has(c.id);
        const ntsClosed = ntsClosedIds.has(c.id);
        const isChurned = c.status === 'churned';
        const ntsCode = ntsOverride[c.id] ?? c.nts?.statusCode ?? '';
        const ntsClosedLabel = ntsCode === '02' ? '휴업' : ntsCode === '03' ? '폐업' : '폐업/휴업';
        const closureKind = showClosureMeta ? getClientClosureKind(c, ntsCode) : null;
        const closureDate = showClosureMeta ? formatClientClosureDate(c) : '';
        const nameProps = getItemProps(c.id);
        return (
          <li key={c.id}>
            <Link
              href={`/clients/${c.id}`}
              onClick={e => {
                if (consumeClick()) e.preventDefault();
              }}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-blue-50/70 ${
                excluded || isChurned ? 'opacity-60' : ''
              }`}
            >
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-blue-400">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  <span
                    {...nameProps}
                    title="꾹 눌러 순서 변경"
                    className={`font-semibold touch-none select-none ${nameProps.className ?? ''} ${
                      excluded || isChurned
                        ? 'text-slate-400 line-through decoration-slate-400'
                        : 'text-slate-800'
                    }`}
                  >
                    {c.companyName || '(이름 없음)'}
                  </span>
                  {(c.representative || c.businessNo) && (
                    <span
                      className={`text-xs font-normal ${
                        excluded || isChurned ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {' · '}
                      {[c.representative, c.businessNo].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {closureDate && (
                  <span className="block truncate text-xs text-slate-400">{closureDate}</span>
                )}
              </span>
              {showClosureMeta && closureKind && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    closureKind === '해임'
                      ? 'bg-red-200 text-red-900'
                      : closureKind === '휴업'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {closureKind === '해임' ? '유출' : closureKind}
                </span>
              )}
              {!showClosureMeta && isChurned && (
                <span className="shrink-0 rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                  유출
                </span>
              )}
              {ntsClosed && (
                <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  {ntsClosedLabel}
                </span>
              )}
              {summary && (
                <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                  합계표제출
                </span>
              )}
              {excluded && (
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                  제외
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function SectionCard({
  label,
  dotClass,
  countClass,
  clients,
  excludedIds,
  summaryIds,
  ntsClosedIds,
  ntsOverride,
  ready,
  showClosureMeta = false,
  managerName,
  allClients,
  sort,
  onOrderChange,
}: {
  label: string;
  dotClass: string;
  countClass: string;
  clients: ClientWithChurn[];
  excludedIds: Set<string>;
  summaryIds: Set<string>;
  ntsClosedIds: Set<string>;
  ntsOverride: Record<string, string>;
  ready: boolean;
  showClosureMeta?: boolean;
  managerName: string | null;
  allClients: ClientWithChurn[];
  sort: SortKey;
  onOrderChange: () => void;
}) {
  const total = clients.length;
  const excl = clients.reduce((n, c) => n + (excludedIds.has(c.id) ? 1 : 0), 0);
  const countText = excl > 0 ? `${total - excl}/${total}곳` : `${total}곳`;
  return (
    <div className="flex flex-col rounded-2xl border border-blue-100 bg-white/80 shadow-sm shadow-blue-100/40">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden />
        <span className="text-sm font-bold text-slate-800">{label}</span>
        <span className={`ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold ${countClass}`}>
          {ready ? countText : '…'}
        </span>
      </div>
      <div className="p-2">
        {ready ? (
          <ClientList
            clients={clients}
            excludedIds={excludedIds}
            summaryIds={summaryIds}
            ntsClosedIds={ntsClosedIds}
            ntsOverride={ntsOverride}
            showClosureMeta={showClosureMeta}
            managerName={managerName}
            allClients={allClients}
            sort={sort}
            onOrderChange={onOrderChange}
          />
        ) : (
          <p className="px-1 py-5 text-center text-sm text-slate-400">불러오는 중…</p>
        )}
      </div>
    </div>
  );
}

export default function MyClientsBoard() {
  const cached = typeof window !== 'undefined' ? getPortalClients() : [];
  const [clients, setClients] = useState<ClientWithChurn[]>(() => cached as ClientWithChurn[]);
  const [ready, setReady] = useState(() => cached.length > 0);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [orderVersion, setOrderVersion] = useState(0);
  const [sort, setSort] = useLocalStorage<SortKey>(CLIENT_SORT_STORAGE_KEY, 'code');
  const [showSingo, setShowSingo] = useState(true);
  const [showJisutaek, setShowJisutaek] = useState(false);
  const [includeChurned, setIncludeChurned] = useState(false);
  const [ntsOverride, setNtsOverride] = useState<Record<string, string>>({});
  const [filingExcluded, setFilingExcluded] = useState<Record<string, string>>({});
  const [ntsChecking, setNtsChecking] = useState(false);
  const [ntsError, setNtsError] = useState('');
  const [churnRecords, setChurnRecords] = useState(() => getPortalChurnRecords());
  const taxFilter = useDashboardTaxFilter();

  useEffect(() => {
    return subscribePortal(() => setChurnRecords(getPortalChurnRecords()));
  }, []);

  useEffect(() => {
    hydratePortal();
    try {
      if (localStorage.getItem(SHOW_SINGO_KEY) === '0') setShowSingo(false);
      if (localStorage.getItem(SHOW_JISUTAEK_KEY) === '1') setShowJisutaek(true);
      if (localStorage.getItem(INCLUDE_CHURNED_KEY) === '1') setIncludeChurned(true);
    } catch {
      /* ignore */
    }
    fetchWithTimeout('/api/auth/me', {}, 10_000)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) setManagerName(String(data.user.name).trim());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const key = `local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`;
    const onStorage = () => setOrderVersion(v => v + 1);
    window.addEventListener(key, onStorage);
    return () => window.removeEventListener(key, onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = includeChurned ? '/api/clients?mine=1&includeChurned=1' : '/api/clients?mine=1';
    // 기존 목록/캐시를 유지한 채 백그라운드 갱신 — setReady(false)로 화면을 비우지 않음
    fetchWithTimeout(url, { cache: 'no-store' }, 20_000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        setClients((d?.clients as ClientWithChurn[]) ?? getPortalClients());
      })
      .catch(() => {
        if (!cancelled) setClients(prev => (prev.length > 0 ? prev : (getPortalClients() as ClientWithChurn[])));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [includeChurned]);

  useEffect(() => {
    if (!taxFilter) {
      setFilingExcluded({});
      return;
    }
    const p = defaultPeriod();
    const pk = periodKey(taxFilter, p);
    fetchWithTimeout(`/api/filing-check/excluded?taxType=${taxFilter}&periodKey=${pk}`, { cache: 'no-store' }, 15_000)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setFilingExcluded((d?.excluded as Record<string, string>) ?? {}))
      .catch(() => setFilingExcluded({}));
  }, [taxFilter]);

  const toggleSingo = (next: boolean) => {
    setShowSingo(next);
    try {
      localStorage.setItem(SHOW_SINGO_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const toggleJisutaek = (next: boolean) => {
    setShowJisutaek(next);
    try {
      localStorage.setItem(SHOW_JISUTAEK_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const toggleIncludeChurned = (next: boolean) => {
    setIncludeChurned(next);
    try {
      localStorage.setItem(INCLUDE_CHURNED_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // 세목 아이콘을 선택하면 '신고대상확인'과 동일한 대상 규칙(filingTargets)으로
  // 신고대상이 아닌 업체는 '제외'로 표시(숨기지 않음)
  const excludedIds = useMemo(() => {
    const s = new Set<string>();
    if (taxFilter) {
      const targetIds = new Set(filingTargets(clients, taxFilter).map(c => c.id));
      for (const c of clients) if (!targetIds.has(c.id)) s.add(c.id);
      for (const id of Object.keys(filingExcluded)) s.add(id);
    }
    return s;
  }, [clients, taxFilter, filingExcluded]);

  // 부가세 보기일 때, 법인 면세(합계표만 제출) 표시
  const summaryIds = useMemo(() => {
    const s = new Set<string>();
    if (taxFilter === 'vat') {
      for (const c of clients) if (isVatSummaryOnlyClient(c)) s.add(c.id);
    }
    return s;
  }, [clients, taxFilter]);

  // 국세청 휴/폐업(02·03) — 캐시값 + 일괄 점검 결과 병합 (유출·휴업확인 완료면 제외)
  const ntsClosedIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients) {
      const code = ntsOverride[c.id] ?? c.nts?.statusCode ?? '';
      if (code !== '02' && code !== '03') continue;
      const merged = {
        ...c,
        nts: {
          status: c.nts?.status ?? '',
          statusCode: code,
          taxType: c.nts?.taxType ?? '',
          closedDate: c.nts?.closedDate ?? '',
          checkedAt: c.nts?.checkedAt ?? null,
          alertAckedAt: c.nts?.alertAckedAt,
          alertAckedCode: c.nts?.alertAckedCode ?? '',
        },
      };
      if (clientNeedsNtsAttention(merged, churnRecords)) s.add(c.id);
    }
    return s;
  }, [clients, ntsOverride, churnRecords]);

  const runNtsCheck = async () => {
    setNtsChecking(true);
    setNtsError('');
    try {
      const res = await fetch('/api/clients/nts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          clients.length > 0 ? { ids: clients.map(c => c.id) } : { mine: true },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        results?: Record<string, { statusCode?: string }>;
      };
      if (!res.ok) throw new Error('점검 실패');
      if (!data.configured) {
        setNtsError('국세청 API 키(NTS_SERVICE_KEY)가 설정되어 있지 않습니다.');
        return;
      }
      const next: Record<string, string> = {};
      for (const [id, r] of Object.entries(data.results ?? {})) next[id] = r.statusCode || '';
      setNtsOverride(prev => ({ ...prev, ...next }));
    } catch (e) {
      setNtsError(e instanceof Error ? e.message : '점검 실패');
    } finally {
      setNtsChecking(false);
    }
  };

  const { corporate, personal, singoDaeri, jisutaek, closureByYear } = useMemo(() => {
    const orderedAll = managerName
      ? applyManagerRosterDisplayOrder(clients, sort, readManagerClientOrder(managerName))
      : clients;
    const orderIndex = new Map(orderedAll.map((c, i) => [c.id, i]));
    const corp: ClientWithChurn[] = [];
    const pers: ClientWithChurn[] = [];
    const singo: ClientWithChurn[] = [];
    const jisu: ClientWithChurn[] = [];
    const closure: ClientWithChurn[] = [];
    const ntsCode = (c: ClientWithChurn) => ntsOverride[c.id] ?? c.nts?.statusCode ?? '';

    for (const c of orderedAll) {
      if (includeChurned && isClosureReviewClient(c, ntsCode(c))) {
        closure.push(c);
        continue;
      }
      const cat = getClientCategory(c);
      if (cat === '법인') corp.push(c);
      else if (cat === SINGO_DAERI) singo.push(c);
      else if (cat === '지주택') jisu.push(c);
      else pers.push(c);
    }
    const order = (a: ClientRecord, b: ClientRecord) => {
      const rank = (c: ClientRecord) => {
        if (excludedIds.has(c.id)) return 2;
        if (c.status === 'churned') return 1;
        return 0;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
    };
    corp.sort(order);
    pers.sort(order);
    singo.sort(order);
    jisu.sort(order);
    closure.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
    return {
      corporate: corp,
      personal: pers,
      singoDaeri: singo,
      jisutaek: jisu,
      closureByYear: groupClientsByClosureYear(closure).map(g => ({
        ...g,
        clients: [...g.clients].sort(
          (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
        ),
      })),
    };
  }, [clients, sort, excludedIds, includeChurned, ntsOverride, managerName, orderVersion]);

  const bumpOrder = useCallback(() => setOrderVersion(v => v + 1), []);
  const sectionProps = {
    managerName,
    allClients: clients,
    sort,
    onOrderChange: bumpOrder,
  };

  const toggleBtn = (key: SortKey, text: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        sort === key
          ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {text}
    </button>
  );

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-700">내 수임처</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runNtsCheck}
            disabled={ntsChecking || !ready}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800 disabled:opacity-50"
          >
            {ntsChecking ? '점검 중…' : '국세청 일괄 점검'}
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={includeChurned}
              onChange={e => toggleIncludeChurned(e.target.checked)}
              className="h-4 w-4 accent-slate-500"
            />
            폐업·해임
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showSingo}
              onChange={e => toggleSingo(e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            신고대리 표시
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showJisutaek}
              onChange={e => toggleJisutaek(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            지주택 표시
          </label>
          <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 ring-1 ring-slate-200">
            {toggleBtn('name', '상호순')}
            {toggleBtn('code', '코드순')}
          </div>
        </div>
      </div>

      {ntsError && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{ntsError}</p>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <SectionCard
            label="법인"
            dotClass={CATEGORY_COLORS.법인.dot}
            countClass={CATEGORY_COLORS.법인.text}
            clients={corporate}
            excludedIds={excludedIds}
            summaryIds={summaryIds}
            ntsClosedIds={ntsClosedIds}
            ntsOverride={ntsOverride}
            ready={ready}
            {...sectionProps}
          />
        </div>

        <div className="space-y-4">
          <SectionCard
            label="개인"
            dotClass={CATEGORY_COLORS.개인.dot}
            countClass={CATEGORY_COLORS.개인.text}
            clients={personal}
            excludedIds={excludedIds}
            summaryIds={summaryIds}
            ntsClosedIds={ntsClosedIds}
            ntsOverride={ntsOverride}
            ready={ready}
            {...sectionProps}
          />
          {showSingo && (
            <SectionCard
              label="신고대리"
              dotClass={CATEGORY_COLORS.신고대리.dot}
              countClass={CATEGORY_COLORS.신고대리.text}
              clients={singoDaeri}
              excludedIds={excludedIds}
              summaryIds={summaryIds}
              ntsClosedIds={ntsClosedIds}
              ntsOverride={ntsOverride}
              ready={ready}
              {...sectionProps}
            />
          )}
          {showJisutaek && jisutaek.length > 0 && (
            <SectionCard
              label="지주택"
              dotClass={CATEGORY_COLORS.지주택.dot}
              countClass={CATEGORY_COLORS.지주택.text}
              clients={jisutaek}
              excludedIds={excludedIds}
              summaryIds={summaryIds}
              ntsClosedIds={ntsClosedIds}
              ntsOverride={ntsOverride}
              ready={ready}
              {...sectionProps}
            />
          )}
        </div>
      </div>

      {includeChurned && closureByYear.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-base font-extrabold tracking-tight text-slate-800">폐업·해임 확인</h3>
            <p className="text-xs text-slate-500">종료 연도별로 신고·정리 여부를 확인하세요.</p>
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {closureByYear.map(group => (
              <SectionCard
                key={String(group.year)}
                label={group.label}
                dotClass="bg-slate-400"
                countClass="text-slate-600"
                clients={group.clients}
                excludedIds={excludedIds}
                summaryIds={summaryIds}
                ntsClosedIds={ntsClosedIds}
                ntsOverride={ntsOverride}
                ready={ready}
                showClosureMeta
                {...sectionProps}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
