'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PortalPageShell, { PortalPageHeader } from '../../components/portal/PortalPageShell';
import {
  portalAlertError,
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalInput,
} from '../../components/portal/uiClasses';
import type { ClientRecord, ChurnRecordView, NtsStatusCache } from '../../types/client';
import {
  formatNtsDate,
  getNtsTaxTypeMismatch,
  ntsBadgeClass,
  normalizeClientTaxKind,
  normalizeNtsTaxType,
  ntsStatusLabel,
  ntsTaxTypeBadgeClass,
} from '@/app/utils/ntsStatus';
import { clientNeedsNtsAttention } from '@/app/utils/churnMatch';
import {
  getPortalChurnRecords,
  hydratePortal,
  subscribePortal,
} from '@/app/utils/portalStore';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';

interface BatchResult {
  status?: string;
  statusCode?: string;
  taxType?: string;
  closedDate?: string;
  found?: boolean;
  checkedAt?: string;
}

type ViewFilter = 'attention' | 'closed' | 'mismatch' | 'unchecked' | 'all';

type NtsRow = {
  client: ClientRecord;
  nts: NtsStatusCache | null;
  taxLabel: string;
  clientTaxLabel: string;
  mismatch: boolean;
  kind: 'closed' | 'resting' | 'mismatch' | 'unchecked' | 'ok';
  needsAction: boolean;
};

function isClosedCode(code: string): boolean {
  return code === '02' || code === '03';
}

function effectiveNts(c: ClientRecord, override: Record<string, NtsStatusCache>): NtsStatusCache | null {
  return override[c.id] ?? c.nts ?? null;
}

function rowKind(
  client: ClientRecord,
  nts: NtsStatusCache | null,
  mismatch: boolean,
  churnRecords: ChurnRecordView[],
): NtsRow['kind'] {
  if (!nts?.checkedAt) return 'unchecked';
  if (nts.statusCode === '03') return 'closed';
  if (nts.statusCode === '02') {
    const merged = { ...client, nts };
    if (clientNeedsNtsAttention(merged, churnRecords)) return 'resting';
    return 'ok';
  }
  if (mismatch) return 'mismatch';
  return 'ok';
}

const KIND_RANK: Record<NtsRow['kind'], number> = {
  closed: 0,
  resting: 1,
  mismatch: 2,
  unchecked: 3,
  ok: 4,
};

const FILTER_LABELS: Record<ViewFilter, string> = {
  attention: '주의 필요',
  closed: '폐업·휴업',
  mismatch: '과세 불일치',
  unchecked: '미점검',
  all: '전체',
};

export default function NtsMonitorPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [override, setOverride] = useState<Record<string, NtsStatusCache>>({});
  const [mineOnly, setMineOnly] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [churnRecords, setChurnRecords] = useState<ChurnRecordView[]>(() => getPortalChurnRecords());
  const [viewFilter, setViewFilter] = useState<ViewFilter>('attention');
  const [q, setQ] = useState('');

  const load = useCallback(async (mine: boolean) => {
    setReady(false);
    try {
      const [clientsRes, churnRes] = await Promise.all([
        fetchWithTimeout(`/api/clients${mine ? '?mine=1' : ''}`, { cache: 'no-store' }, 20_000),
        fetchWithTimeout('/api/churn', { cache: 'no-store' }, 15_000),
      ]);
      const clientsData = (await clientsRes.json().catch(() => ({}))) as { clients?: ClientRecord[] };
      const churnData = (await churnRes.json().catch(() => ({}))) as { records?: ChurnRecordView[] };
      setClients(clientsData.clients ?? []);
      if (Array.isArray(churnData.records)) setChurnRecords(churnData.records);
    } catch {
      setClients([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    hydratePortal();
    void load(mineOnly);
  }, [load, mineOnly]);

  useEffect(() => {
    return subscribePortal(() => {
      const portal = getPortalChurnRecords();
      if (portal.length > 0) setChurnRecords(portal);
    });
  }, []);

  const ackResting = useCallback(async (clientId: string) => {
    const res = await fetch(`/api/clients/${clientId}/nts-ack`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '확인 실패');
    const now = new Date().toISOString();
    setClients(prev =>
      prev.map(c =>
        c.id === clientId && c.nts
          ? { ...c, nts: { ...c.nts, alertAckedAt: now, alertAckedCode: '02' } }
          : c,
      ),
    );
    setOverride(prev => {
      const cur = prev[clientId];
      if (!cur) return prev;
      return { ...prev, [clientId]: { ...cur, alertAckedAt: now, alertAckedCode: '02' } };
    });
  }, []);

  const runCheck = useCallback(async () => {
    if (clients.length === 0) return;
    setChecking(true);
    setError('');
    try {
      const ids = clients.map(c => c.id);
      const res = await fetch('/api/clients/nts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mineOnly ? { mine: true } : { ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        results?: Record<string, BatchResult>;
      };
      if (!res.ok) throw new Error('점검 실패');
      if (!data.configured) {
        setError('국세청 API 키(NTS_SERVICE_KEY)가 설정되어 있지 않습니다.');
        return;
      }
      const next: Record<string, NtsStatusCache> = {};
      for (const [id, r] of Object.entries(data.results ?? {})) {
        next[id] = {
          status: r.status ?? '',
          statusCode: r.statusCode ?? '',
          taxType: r.taxType ?? '',
          closedDate: r.closedDate ?? '',
          checkedAt: r.checkedAt ?? new Date().toISOString(),
        };
      }
      setOverride(prev => ({ ...prev, ...next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '점검 실패');
    } finally {
      setChecking(false);
    }
  }, [clients, mineOnly]);

  const { rows, closedCount, restingCount, uncheckedCount, mismatchCount, attentionCount, lastCheckedAt } =
    useMemo(() => {
      const all: NtsRow[] = [];
      let closed = 0;
      let resting = 0;
      let unchecked = 0;
      let mismatch = 0;
      let attention = 0;
      let last = 0;

      for (const c of clients) {
        const nts = effectiveNts(c, override);
        const taxLabel = nts?.taxType ? normalizeNtsTaxType(nts.taxType) : '';
        const clientTaxKind = String(c.intakeData?.taxKind ?? '');
        const clientTaxLabel = normalizeClientTaxKind(clientTaxKind);
        const hasMismatch = !!(nts && getNtsTaxTypeMismatch(clientTaxKind, nts.taxType));
        const kind = rowKind(c, nts, hasMismatch, churnRecords);
        const needsAction =
          kind === 'closed' || kind === 'resting' || (kind === 'unchecked' && !!c.businessNo?.replace(/\D/g, ''));

        if (kind === 'closed') closed += 1;
        if (kind === 'resting') resting += 1;
        if (kind === 'unchecked') unchecked += 1;
        if (kind === 'mismatch') mismatch += 1;
        if (kind !== 'ok') attention += 1;

        if (nts?.checkedAt) {
          const t = Date.parse(nts.checkedAt) || 0;
          if (t > last) last = t;
        }

        all.push({
          client: c,
          nts,
          taxLabel,
          clientTaxLabel,
          mismatch: hasMismatch,
          kind,
          needsAction,
        });
      }

      all.sort((a, b) => {
        const dr = KIND_RANK[a.kind] - KIND_RANK[b.kind];
        if (dr !== 0) return dr;
        return (a.client.companyName || '').localeCompare(b.client.companyName || '', 'ko');
      });

      return {
        rows: all,
        closedCount: closed,
        restingCount: resting,
        uncheckedCount: unchecked,
        mismatchCount: mismatch,
        attentionCount: attention,
        lastCheckedAt: last ? new Date(last) : null,
      };
    }, [clients, override, churnRecords]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(row => {
      if (needle) {
        const hay = [
          row.client.companyName,
          row.client.manager,
          row.client.representative,
          row.client.businessNo,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      switch (viewFilter) {
        case 'attention':
          return row.kind !== 'ok';
        case 'closed':
          return row.kind === 'closed' || row.kind === 'resting';
        case 'mismatch':
          return row.mismatch;
        case 'unchecked':
          return row.kind === 'unchecked';
        case 'all':
        default:
          return true;
      }
    });
  }, [rows, viewFilter, q]);

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="폐업·휴업 점검"
        description="국세청 사업자상태·과세유형을 점검합니다. 매주 월요일 자동 점검됩니다."
      />

      <div className={`${portalCard} mb-4 flex flex-wrap items-center gap-3 p-4`}>
        <div className="flex flex-wrap gap-2">
          <StatPill
            label="주의 필요"
            count={attentionCount}
            tone="orange"
            active={viewFilter === 'attention'}
            onClick={() => setViewFilter('attention')}
          />
          <StatPill
            label="폐업"
            count={closedCount}
            tone="red"
            active={viewFilter === 'closed'}
            onClick={() => setViewFilter('closed')}
          />
          <StatPill
            label="휴업"
            count={restingCount}
            tone="amber"
            active={viewFilter === 'closed'}
            onClick={() => setViewFilter('closed')}
          />
          <StatPill
            label="과세 불일치"
            count={mismatchCount}
            tone="orange"
            active={viewFilter === 'mismatch'}
            onClick={() => setViewFilter('mismatch')}
          />
          <StatPill
            label="미점검"
            count={uncheckedCount}
            tone="slate"
            active={viewFilter === 'unchecked'}
            onClick={() => setViewFilter('unchecked')}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={e => {
                setOverride({});
                setMineOnly(e.target.checked);
              }}
              className="h-4 w-4 accent-blue-500"
            />
            내 담당만
          </label>
          <button
            type="button"
            onClick={runCheck}
            disabled={checking || !ready || clients.length === 0}
            className={portalBtnPrimary}
          >
            {checking ? '점검 중…' : '지금 다시 점검'}
          </button>
        </div>
      </div>

      {error && <div className={`${portalAlertError} mb-4`}>{error}</div>}

      {lastCheckedAt && (
        <p className="mb-3 text-xs text-slate-400">
          마지막 점검: {lastCheckedAt.toLocaleString('ko-KR')}
        </p>
      )}

      <div className={`${portalCard} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(FILTER_LABELS) as ViewFilter[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setViewFilter(key)}
                className={[
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                  viewFilter === key
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {FILTER_LABELS[key]}
                {key === 'attention' && attentionCount > 0 ? ` (${attentionCount})` : ''}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="상호·담당·사업자번호 검색"
            className={`${portalInput} ml-auto min-w-[10rem] max-w-xs text-xs`}
          />
        </div>

        {!ready ? (
          <p className="portal-meta py-12 text-center">불러오는 중…</p>
        ) : filteredRows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">
              {viewFilter === 'attention'
                ? '주의가 필요한 거래처가 없습니다.'
                : `${FILTER_LABELS[viewFilter]} 항목이 없습니다.`}
            </p>
            {viewFilter === 'attention' && uncheckedCount > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                미점검 {uncheckedCount}곳 —{' '}
                <button
                  type="button"
                  className="font-semibold text-blue-600 hover:underline"
                  onClick={() => setViewFilter('unchecked')}
                >
                  미점검 목록 보기
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold normal-case">거래처</th>
                  <th className="px-3 py-2.5 w-24">상태</th>
                  <th className="px-3 py-2.5 w-36">과세유형</th>
                  <th className="px-4 py-2.5 w-28 text-right">조치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRows.map(row => (
                  <ResultRow key={row.client.id} row={row} onAckResting={ackResting} onError={setError} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ready && filteredRows.length > 0 && (
          <p className="border-t border-slate-50 px-4 py-2 text-[11px] text-slate-400">
            {filteredRows.length}건 표시 · 전체 {rows.length}건
          </p>
        )}
      </div>

      <p className={`${portalAlertInfo} mt-5`}>
        자동 점검은 매주 월요일 오전 9시에 실행됩니다. 과세유형은 국세청 조회값과 수임처(더존) 과세유형을
        비교합니다.
      </p>
    </PortalPageShell>
  );
}

function ResultRow({
  row,
  onAckResting,
  onError,
}: {
  row: NtsRow;
  onAckResting: (clientId: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const { client, nts, taxLabel, clientTaxLabel, mismatch, kind } = row;
  const [acking, setAcking] = useState(false);

  const rowBg =
    kind === 'closed'
      ? 'bg-red-50/40'
      : kind === 'resting'
        ? 'bg-amber-50/30'
        : mismatch
          ? 'bg-orange-50/30'
          : '';

  return (
    <tr className={rowBg}>
      <td className="px-4 py-2.5">
        <Link
          href={`/clients/${client.id}`}
          className="block text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline"
        >
          {client.companyName || '(이름 없음)'}
        </Link>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {[client.manager, client.businessNo].filter(Boolean).join(' · ') || '—'}
        </p>
      </td>
      <td className="px-3 py-2.5 align-top">
        {nts?.checkedAt ? (
          <div className="space-y-0.5">
            <span
              className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${ntsBadgeClass(
                nts.statusCode,
              )}`}
            >
              {ntsStatusLabel(nts)}
            </span>
            {nts.closedDate && (
              <p className="text-[10px] text-slate-400">{formatNtsDate(nts.closedDate)}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">미점검</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <TaxCompareCell ntsLabel={taxLabel} clientLabel={clientTaxLabel} mismatch={mismatch} />
      </td>
      <td className="px-4 py-2.5 align-top text-right">
        {kind === 'resting' ? (
          <button
            type="button"
            disabled={acking}
            className={`${portalBtnSecondary} text-xs`}
            onClick={async () => {
              setAcking(true);
              try {
                await onAckResting(client.id);
              } catch (e) {
                onError(e instanceof Error ? e.message : '확인 실패');
              } finally {
                setAcking(false);
              }
            }}
          >
            {acking ? '…' : '확인'}
          </button>
        ) : kind === 'closed' ? (
          <Link href={`/clients/churn?prefillClientId=${client.id}`} className={`${portalBtnSecondary} text-xs`}>
            유출
          </Link>
        ) : mismatch ? (
          <Link href={`/clients/${client.id}`} className={`${portalBtnSecondary} text-xs`}>
            상세
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

function TaxCompareCell({
  ntsLabel,
  clientLabel,
  mismatch,
}: {
  ntsLabel: string;
  clientLabel: string;
  mismatch: boolean;
}) {
  if (!ntsLabel && !clientLabel) {
    return <span className="text-xs text-slate-300">—</span>;
  }
  if (ntsLabel && clientLabel && ntsLabel === clientLabel && !mismatch) {
    return (
      <span
        className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ntsTaxTypeBadgeClass(ntsLabel)}`}
      >
        {ntsLabel}
      </span>
    );
  }
  return (
    <div className="space-y-1">
      {ntsLabel ? (
        <div className="flex items-center gap-1">
          <span className="w-9 shrink-0 text-[10px] text-slate-400">국세청</span>
          <span
            className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${ntsTaxTypeBadgeClass(ntsLabel)}`}
          >
            {ntsLabel}
          </span>
        </div>
      ) : null}
      {clientLabel ? (
        <div className="flex items-center gap-1">
          <span className="w-9 shrink-0 text-[10px] text-slate-400">수임처</span>
          <span className="inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            {clientLabel}
          </span>
        </div>
      ) : null}
      {mismatch && <p className="text-[10px] font-semibold text-orange-600">불일치</p>}
    </div>
  );
}

function StatPill({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: 'red' | 'amber' | 'orange' | 'slate';
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'orange'
          ? 'border-orange-200 bg-orange-50 text-orange-800'
          : 'border-slate-200 bg-slate-50 text-slate-600';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-shadow',
        toneClass,
        onClick ? 'cursor-pointer hover:shadow-sm' : '',
        active ? 'ring-2 ring-slate-400 ring-offset-1' : '',
      ].join(' ')}
    >
      {label}
      <span className="tabular-nums">{count}</span>
    </Tag>
  );
}
