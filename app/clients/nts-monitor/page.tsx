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

function isClosedCode(code: string): boolean {
  return code === '02' || code === '03';
}

function effectiveNts(c: ClientRecord, override: Record<string, NtsStatusCache>): NtsStatusCache | null {
  return override[c.id] ?? c.nts ?? null;
}

export default function NtsMonitorPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [override, setOverride] = useState<Record<string, NtsStatusCache>>({});
  const [mineOnly, setMineOnly] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [churnRecords, setChurnRecords] = useState<ChurnRecordView[]>(() => getPortalChurnRecords());

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

  const { flagged, closedCount, restingCount, uncheckedCount, mismatchCount, lastCheckedAt, allRows } =
    useMemo(() => {
    const flaggedList: Array<{ client: ClientRecord; nts: NtsStatusCache }> = [];
    const rows: Array<{
      client: ClientRecord;
      nts: NtsStatusCache | null;
      taxLabel: string;
      clientTaxLabel: string;
      mismatch: boolean;
    }> = [];
    let closed = 0;
    let resting = 0;
    let unchecked = 0;
    let mismatch = 0;
    let last = 0;
    for (const c of clients) {
      const nts = effectiveNts(c, override);
      const taxLabel = nts?.taxType ? normalizeNtsTaxType(nts.taxType) : '';
      const clientTaxKind = String(c.intakeData?.taxKind ?? '');
      const clientTaxLabel = normalizeClientTaxKind(clientTaxKind);
      const hasMismatch = !!(nts && getNtsTaxTypeMismatch(clientTaxKind, nts.taxType));
      if (hasMismatch) mismatch += 1;

      rows.push({ client: c, nts, taxLabel, clientTaxLabel, mismatch: hasMismatch });

      if (!nts || !nts.checkedAt) {
        unchecked += 1;
        continue;
      }
      const t = Date.parse(nts.checkedAt) || 0;
      if (t > last) last = t;
      if (isClosedCode(nts.statusCode)) {
        const merged = {
          ...c,
          nts: {
            ...nts,
            alertAckedAt: nts.alertAckedAt ?? c.nts?.alertAckedAt,
            alertAckedCode: nts.alertAckedCode ?? c.nts?.alertAckedCode ?? '',
          },
        };
        if (!clientNeedsNtsAttention(merged, churnRecords)) continue;
        flaggedList.push({ client: merged, nts: merged.nts! });
        if (nts.statusCode === '03') closed += 1;
        else resting += 1;
      }
    }
    rows.sort((a, b) =>
      (a.client.companyName || '').localeCompare(b.client.companyName || '', 'ko'),
    );
    flaggedList.sort((a, b) => {
      if (a.nts.statusCode !== b.nts.statusCode) return a.nts.statusCode === '03' ? -1 : 1;
      return (a.client.companyName || '').localeCompare(b.client.companyName || '', 'ko');
    });
    return {
      flagged: flaggedList,
      closedCount: closed,
      restingCount: resting,
      uncheckedCount: unchecked,
      mismatchCount: mismatch,
      lastCheckedAt: last ? new Date(last) : null,
      allRows: rows,
    };
  }, [clients, override, churnRecords]);

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="폐업·휴업 점검"
        description="국세청 사업자상태·과세유형으로 폐업·휴업·과세유형 불일치를 모아 봅니다. 매주 월요일 자동 점검됩니다."
      />

      <div className={`${portalCard} mb-4 flex flex-wrap items-center gap-3 p-4`}>
        <div className="flex flex-wrap gap-2">
          <StatPill label="폐업" count={closedCount} tone="red" />
          <StatPill label="휴업" count={restingCount} tone="amber" />
          <StatPill label="과세유형 불일치" count={mismatchCount} tone="orange" />
          <StatPill label="미점검" count={uncheckedCount} tone="slate" />
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

      {!ready ? (
        <p className="portal-meta py-10 text-center">불러오는 중…</p>
      ) : flagged.length === 0 ? (
        <div className={`${portalCard} p-8 text-center`}>
          <p className="text-sm font-semibold text-slate-700">현재 폐업·휴업으로 확인된 거래처가 없습니다.</p>
          {uncheckedCount > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              아직 점검되지 않은 거래처가 {uncheckedCount}곳 있습니다. “지금 다시 점검”으로 즉시 확인할 수 있습니다.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {flagged.map(({ client, nts }) => (
            <li key={client.id} className={`${portalCard} flex flex-wrap items-center gap-3 p-3.5`}>
              <span
                className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-bold ${ntsBadgeClass(
                  nts.statusCode,
                )}`}
              >
                {ntsStatusLabel(nts)}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/clients/${client.id}`}
                  className="block truncate text-sm font-bold text-slate-800 hover:text-blue-700 hover:underline"
                >
                  {client.companyName || '(이름 없음)'}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {[
                    client.manager,
                    client.representative,
                    client.businessNo,
                    nts.closedDate ? `폐업일 ${formatNtsDate(nts.closedDate)}` : '',
                    nts.taxType ? `국세청 ${normalizeNtsTaxType(nts.taxType)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {nts.statusCode === '02' ? (
                <button
                  type="button"
                  className={`${portalBtnSecondary} shrink-0`}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/clients/${client.id}/nts-ack`, { method: 'POST' });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || '확인 실패');
                      setClients(prev =>
                        prev.map(c =>
                          c.id === client.id && c.nts
                            ? {
                                ...c,
                                nts: {
                                  ...c.nts,
                                  alertAckedAt: new Date().toISOString(),
                                  alertAckedCode: '02',
                                },
                              }
                            : c,
                        ),
                      );
                      setOverride(prev => {
                        const cur = prev[client.id] ?? client.nts;
                        if (!cur) return prev;
                        return {
                          ...prev,
                          [client.id]: {
                            ...cur,
                            alertAckedAt: new Date().toISOString(),
                            alertAckedCode: '02',
                          },
                        };
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : '확인 실패');
                    }
                  }}
                >
                  확인
                </button>
              ) : (
                <Link
                  href={`/clients/churn?prefillClientId=${client.id}`}
                  className={`${portalBtnSecondary} shrink-0`}
                >
                  유출 등록 →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {ready && allRows.length > 0 && (
        <div className={`${portalCard} mt-6 overflow-hidden`}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-800">점검 결과</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              사업자상태·국세청 과세유형·수임처 과세유형을 한눈에 봅니다.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <th className="px-3 py-2">상호</th>
                  <th className="px-3 py-2">담당</th>
                  <th className="px-3 py-2">사업자상태</th>
                  <th className="px-3 py-2">국세청 과세</th>
                  <th className="px-3 py-2">수임처 과세</th>
                  <th className="px-3 py-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map(({ client, nts, taxLabel, clientTaxLabel, mismatch }) => (
                  <tr
                    key={client.id}
                    className={[
                      'border-b border-slate-50 last:border-b-0',
                      mismatch ? 'bg-orange-50/50' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-semibold text-slate-800 hover:text-blue-700 hover:underline"
                      >
                        {client.companyName || '(이름 없음)'}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{client.manager || '—'}</td>
                    <td className="px-3 py-2">
                      {nts?.checkedAt ? (
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${ntsBadgeClass(
                            nts.statusCode,
                          )}`}
                        >
                          {ntsStatusLabel(nts)}
                        </span>
                      ) : (
                        <span className="text-slate-400">미점검</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {taxLabel ? (
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${ntsTaxTypeBadgeClass(taxLabel)}`}
                        >
                          {taxLabel}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {clientTaxLabel ? (
                        <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {clientTaxLabel}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {mismatch ? (
                        <span className="font-semibold text-orange-700">과세유형 불일치</span>
                      ) : nts?.checkedAt ? (
                        new Date(nts.checkedAt).toLocaleDateString('ko-KR')
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className={`${portalAlertInfo} mt-5`}>
        자동 점검은 매주 월요일 오전 9시에 전체 거래처를 대상으로 실행됩니다. 배지가 오래됐다면 “지금 다시 점검”으로
        즉시 갱신할 수 있습니다.
      </p>
    </PortalPageShell>
  );
}

function StatPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'red' | 'amber' | 'orange' | 'slate';
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'orange'
          ? 'border-orange-200 bg-orange-50 text-orange-800'
          : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {label}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
