'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ClientRecord } from '@/app/types/client';
import { getClientCategory, getClientDouzoneCode, SINGO_DAERI } from '@/app/utils/clientsGrouping';
import { CATEGORY_COLORS } from '@/app/utils/categoryColors';
import { useDashboardTaxFilter } from '@/app/utils/dashboardTaxFilter';
import { filingTargets, isVatSummaryOnlyClient } from '@/app/utils/filingCheck';
import { getPortalClients, hydratePortal } from '@/app/utils/portalStore';

type SortKey = 'name' | 'code';

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
}: {
  clients: ClientRecord[];
  excludedIds: Set<string>;
  summaryIds: Set<string>;
  ntsClosedIds: Set<string>;
}) {
  if (clients.length === 0) {
    return <p className="px-1 py-5 text-center text-sm text-slate-400">담당 수임처가 없습니다.</p>;
  }
  return (
    <ol className="divide-y divide-slate-100">
      {clients.map((c, i) => {
        const excluded = excludedIds.has(c.id);
        const summary = summaryIds.has(c.id);
        const ntsClosed = ntsClosedIds.has(c.id);
        return (
          <li key={c.id}>
            <Link
              href={`/clients/${c.id}`}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-blue-50/70 ${
                excluded ? 'opacity-60' : ''
              }`}
            >
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-blue-400">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm font-semibold ${
                    excluded ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-800'
                  }`}
                >
                  {c.companyName || '(이름 없음)'}
                </span>
                {(c.representative || c.businessNo) && (
                  <span className="block truncate text-xs text-slate-400">
                    {[c.representative, c.businessNo].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {ntsClosed && (
                <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  폐업/휴업
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
  ready,
}: {
  label: string;
  dotClass: string;
  countClass: string;
  clients: ClientRecord[];
  excludedIds: Set<string>;
  summaryIds: Set<string>;
  ntsClosedIds: Set<string>;
  ready: boolean;
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
          <ClientList clients={clients} excludedIds={excludedIds} summaryIds={summaryIds} ntsClosedIds={ntsClosedIds} />
        ) : (
          <p className="px-1 py-5 text-center text-sm text-slate-400">불러오는 중…</p>
        )}
      </div>
    </div>
  );
}

const SHOW_SINGO_KEY = 'dashboard.showSingoDaeri';

export default function MyClientsBoard() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [sort, setSort] = useState<SortKey>('code');
  const [showSingo, setShowSingo] = useState(true);
  const [ntsOverride, setNtsOverride] = useState<Record<string, string>>({});
  const [ntsChecking, setNtsChecking] = useState(false);
  const [ntsError, setNtsError] = useState('');
  const taxFilter = useDashboardTaxFilter();

  useEffect(() => {
    hydratePortal();
    try {
      if (localStorage.getItem(SHOW_SINGO_KEY) === '0') setShowSingo(false);
    } catch {
      /* ignore */
    }
    // 로그인 직후 본인 담당 수임처를 바로 표시 — 서버에서 '내 담당'만(담당자명·배정 모두 매칭),
    // 포털 부트스트랩 타이밍/관리자 전체노출과 무관하게 항상 본인 것만 뜬다.
    fetch('/api/clients?mine=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setClients((d?.clients as ClientRecord[]) ?? getPortalClients()))
      .catch(() => setClients(getPortalClients()))
      .finally(() => setReady(true));
  }, []);

  const toggleSingo = (next: boolean) => {
    setShowSingo(next);
    try {
      localStorage.setItem(SHOW_SINGO_KEY, next ? '1' : '0');
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
    }
    return s;
  }, [clients, taxFilter]);

  // 부가세 보기일 때, 법인 면세(합계표만 제출) 표시
  const summaryIds = useMemo(() => {
    const s = new Set<string>();
    if (taxFilter === 'vat') {
      for (const c of clients) if (isVatSummaryOnlyClient(c)) s.add(c.id);
    }
    return s;
  }, [clients, taxFilter]);

  // 국세청 휴/폐업(02·03) — 캐시값 + 일괄 점검 결과 병합
  const ntsClosedIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients) {
      const code = ntsOverride[c.id] ?? c.nts?.statusCode ?? '';
      if (code === '02' || code === '03') s.add(c.id);
    }
    return s;
  }, [clients, ntsOverride]);

  const runNtsCheck = async () => {
    setNtsChecking(true);
    setNtsError('');
    try {
      const res = await fetch('/api/clients/nts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mine: true }),
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

  const { corporate, personal, singoDaeri } = useMemo(() => {
    const cmp = sort === 'name' ? compareByName : compareByCode;
    const corp: ClientRecord[] = [];
    const pers: ClientRecord[] = [];
    const singo: ClientRecord[] = [];
    for (const c of clients) {
      const cat = getClientCategory(c);
      if (cat === '법인') corp.push(c);
      else if (cat === SINGO_DAERI) singo.push(c);
      else pers.push(c); // 개인 + 비사업자 + 미분류 등
    }
    // 제외 업체는 아래로 내려 정렬(대상 먼저 보기 쉽게), 그 안에서 선택 정렬 기준 적용
    const order = (a: ClientRecord, b: ClientRecord) => {
      const ea = excludedIds.has(a.id) ? 1 : 0;
      const eb = excludedIds.has(b.id) ? 1 : 0;
      if (ea !== eb) return ea - eb;
      return cmp(a, b);
    };
    corp.sort(order);
    pers.sort(order);
    singo.sort(order);
    return { corporate: corp, personal: pers, singoDaeri: singo };
  }, [clients, sort, excludedIds]);

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-800">내 수임처</h2>
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
              checked={showSingo}
              onChange={e => toggleSingo(e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            신고대리 표시
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
        {/* 왼쪽: 법인(파랑) */}
        <SectionCard
          label="법인"
          dotClass={CATEGORY_COLORS.법인.dot}
          countClass={CATEGORY_COLORS.법인.text}
          clients={corporate}
          excludedIds={excludedIds}
          summaryIds={summaryIds}
          ntsClosedIds={ntsClosedIds}
          ready={ready}
        />

        {/* 오른쪽: 개인(초록) → 그 아래 신고대리(보라, 표시 체크 시) */}
        <div className="space-y-4">
          <SectionCard
            label="개인"
            dotClass={CATEGORY_COLORS.개인.dot}
            countClass={CATEGORY_COLORS.개인.text}
            clients={personal}
            excludedIds={excludedIds}
            summaryIds={summaryIds}
            ntsClosedIds={ntsClosedIds}
            ready={ready}
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
              ready={ready}
            />
          )}
        </div>
      </div>
    </section>
  );
}
