'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalMain,
} from '@/app/components/portal/uiClasses';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  ARREARS_MANAGER_NAMES,
  ARREARS_MGMT_CATEGORIES,
  arrearsCategoryChipClass,
  arrearsCategoryLabel,
  arrearsCategoryRowClass,
  formatArrearsWon,
  type ArrearsEntryDto,
  type ArrearsManagerTotal,
} from '@/app/types/arrears';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import ArrearsManualEntryModal, {
  type ManualChannel,
} from '@/app/arrears/ArrearsManualEntryModal';

type BulkRow = {
  clientId: string;
  clientName: string;
  manager: string;
  monthlyFee: number;
  entryId: string | null;
  externalCode: string | null;
  status: string;
  statusLabel: string;
  description: string;
};

type BulkPreview = {
  yearMonth: string;
  description: string;
  ready: number;
  readyAmount: number;
  skipped: number;
  totalClients: number;
  rows: BulkRow[];
};

function defaultYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ArrearsPageClient() {
  const [items, setItems] = useState<ArrearsEntryDto[]>([]);
  const [totals, setTotals] = useState<ArrearsManagerTotal[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [asOfDate, setAsOfDate] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [manager, setManager] = useState('');
  const [category, setCategory] = useState('all');
  const [nonzero, setNonzero] = useState(false);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualChannel, setManualChannel] = useState<ManualChannel>('thebill');
  const [manualEntryId, setManualEntryId] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkYearMonth, setBulkYearMonth] = useState(defaultYearMonth);
  const [bulkManager, setBulkManager] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (mode: 'full' | 'soft' = 'full') => {
      const params = new URLSearchParams();
      if (manager) params.set('manager', manager);
      if (category !== 'all') params.set('category', category);
      if (nonzero) params.set('nonzero', '1');
      if (qDebounced) params.set('q', qDebounced);

      if (mode === 'full') {
        setLoading(true);
        setError('');
      }

      try {
        const res = await fetchWithTimeout(
          `/api/arrears?${params.toString()}`,
          { cache: 'no-store' },
          20_000,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '목록 조회 실패');

        setItems((data as { items: ArrearsEntryDto[] }).items || []);
        setTotals((data as { totalsByManager: ArrearsManagerTotal[] }).totalsByManager || []);
        setTotalBalance((data as { totalBalance?: number }).totalBalance || 0);
        setAsOfDate((data as { asOfDate?: string }).asOfDate || '');
        setCanManage(!!(data as { canManage?: boolean }).canManage);
      } catch (e) {
        if (mode === 'full') {
          setError(e instanceof Error ? e.message : '불러오기 실패');
        }
      } finally {
        if (mode === 'full') setLoading(false);
      }
    },
    [manager, category, nonzero, qDebounced],
  );

  useEffect(() => {
    void load('full');
  }, [load]);

  useEffect(() => {
    const soft = () => {
      if (document.visibilityState === 'visible') void load('soft');
    };
    document.addEventListener('visibilitychange', soft);
    const id = window.setInterval(soft, 45_000);
    return () => {
      document.removeEventListener('visibilitychange', soft);
      window.clearInterval(id);
    };
  }, [load]);

  const patchRow = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ArrearsEntryDto, 'managerName' | 'mgmtCategory' | 'memo'>>,
    ) => {
      setSavingId(id);
      setError('');
      try {
        const res = await fetch(`/api/arrears/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
        const item = (data as { item: ArrearsEntryDto }).item;
        setItems(prev => prev.map(r => (r.id === id ? { ...r, ...item } : r)));
        void load('soft');
        return item;
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패');
        throw e;
      } finally {
        setSavingId(null);
      }
    },
    [load],
  );

  const openManual = (channel: ManualChannel, entryId = '') => {
    setManualChannel(channel);
    setManualEntryId(entryId);
    setManualOpen(true);
  };

  const submitManual = async (payload: {
    entryId: string;
    channel: ManualChannel;
    amount: number;
    eventDate: string;
    description: string;
  }) => {
    setManualBusy(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setManualOpen(false);
      await load('full');
    } catch (e) {
      throw e instanceof Error ? e : new Error('반영 실패');
    } finally {
      setManualBusy(false);
    }
  };

  const openBulk = () => {
    setBulkYearMonth(defaultYearMonth());
    setBulkManager(manager);
    setBulkPreview(null);
    setBulkMsg('');
    setBulkOpen(true);
  };

  const previewBulk = async () => {
    setBulkBusy(true);
    setBulkMsg('');
    setError('');
    try {
      const res = await fetch('/api/arrears/bulk-bookkeeping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearMonth: bulkYearMonth,
          manager: bulkManager || undefined,
          confirm: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '미리보기 실패');
      setBulkPreview(data as BulkPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기 실패');
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulk = async () => {
    if (!bulkPreview?.ready) return;
    if (
      !window.confirm(
        `${bulkPreview.description}\n${bulkPreview.ready}건 · ${formatArrearsWon(bulkPreview.readyAmount)}원 반영할까요?`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setBulkMsg('');
    setError('');
    try {
      const res = await fetch('/api/arrears/bulk-bookkeeping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yearMonth: bulkYearMonth,
          manager: bulkManager || undefined,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '일괄 반영 실패');
      const applied = Number((data as { applied?: number }).applied) || 0;
      const amount = Number((data as { appliedAmount?: number }).appliedAmount) || 0;
      const failed = Number((data as { failed?: number }).failed) || 0;
      setBulkMsg(
        `반영 완료: ${applied}건 · ${formatArrearsWon(amount)}원` +
          (failed ? ` · 실패 ${failed}` : ''),
      );
      setBulkPreview(null);
      await load('full');
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 반영 실패');
    } finally {
      setBulkBusy(false);
    }
  };

  const managerFilterOptions = useMemo(() => {
    const set = new Set<string>([...ARREARS_MANAGER_NAMES]);
    for (const t of totals) {
      if (t.managerName && t.managerName !== '(미지정)') set.add(t.managerName);
    }
    return [...set];
  }, [totals]);

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full space-y-4 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">미수관리</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              상호를 누르면 미수 내역·사유를 볼 수 있습니다. 매달 기장료는 「월 기장료」로 일괄,
              예외는 더빌·입금은 CMS로 반영하세요.
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={portalBtnPrimary} onClick={openBulk}>
                월 기장료
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => openManual('thebill')}
              >
                더빌
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => openManual('cms')}
              >
                CMS
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-800">
            기준일 {asOfDate || '—'}
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 tabular-nums">
            총미수 {formatArrearsWon(totalBalance)}원
          </span>
          <span className="text-xs text-slate-500">{items.length}건</span>
        </div>

        {totals.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {totals.map(t => (
              <button
                key={t.managerName}
                type="button"
                onClick={() =>
                  setManager(m =>
                    m === t.managerName && t.managerName !== '(미지정)'
                      ? ''
                      : t.managerName === '(미지정)'
                        ? ''
                        : t.managerName,
                  )
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors ${
                  manager === t.managerName
                    ? 'border-blue-400 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {t.managerName} · {formatArrearsWon(t.balance)} ({t.count})
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            담당
            <select
              className={`${portalInput} min-w-[7rem] py-2`}
              value={manager}
              onChange={e => setManager(e.target.value)}
            >
              <option value="">전체</option>
              {managerFilterOptions.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            관리분류
            <select
              className={`${portalInput} min-w-[7rem] py-2`}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="all">전체</option>
              <option value="">미분류</option>
              {ARREARS_MGMT_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={nonzero}
              onChange={e => setNonzero(e.target.checked)}
              className="rounded border-slate-300"
            />
            잔액 ≠ 0
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            검색
            <input
              className={`${portalInput} py-2`}
              placeholder="상호·코드·사업자번호"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${portalBtnSecondary} py-2`}
            onClick={() => void load('full')}
          >
            새로고침
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-500">관리색</span>
          {ARREARS_MGMT_CATEGORIES.map(c => (
            <span
              key={c.id}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium ${arrearsCategoryChipClass(c.id)}`}
            >
              {c.label}
            </span>
          ))}
          {canManage ? (
            <span className="ml-auto text-[11px] text-slate-500">
              잔액 클릭 → CMS · 행 「더빌」버튼으로 청구
            </span>
          ) : null}
        </div>

        {error ? <div className={portalAlertError}>{error}</div> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2.5 whitespace-nowrap">코드</th>
                <th className="px-3 py-2.5">상호</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">미수 잔액</th>
                <th className="px-3 py-2.5 min-w-[12rem]">미수 사유</th>
                <th className="px-3 py-2.5 whitespace-nowrap">담당</th>
                <th className="px-3 py-2.5 whitespace-nowrap">관리</th>
                <th className="px-3 py-2.5 min-w-[8rem]">메모</th>
                {canManage ? (
                  <th className="px-3 py-2.5 whitespace-nowrap print:hidden">입력</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-3 py-10 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-3 py-10 text-center text-slate-500">
                    표시할 미수 항목이 없습니다.
                    {nonzero ? ' 「잔액 ≠ 0」 필터를 꺼 보세요.' : ''}
                  </td>
                </tr>
              ) : (
                items.map(row => (
                  <tr
                    key={row.id}
                    className={`hover:brightness-[0.98] ${arrearsCategoryRowClass(row.mgmtCategory)}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {row.externalCode}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/arrears/${row.id}`}
                          className="text-blue-800 underline-offset-2 hover:underline"
                          title="미수 내역"
                        >
                          {row.companyName}
                        </Link>
                        {row.clientId ? (
                          <Link
                            href={`/clients/${row.clientId}`}
                            className="text-[11px] font-normal text-slate-500 underline-offset-2 hover:underline"
                          >
                            수임처
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canManage ? (
                        <button
                          type="button"
                          title="CMS 입금 반영"
                          disabled={savingId === row.id}
                          onClick={() => openManual('cms', row.id)}
                          className={`rounded px-1.5 py-0.5 tabular-nums font-semibold underline-offset-2 hover:underline ${
                            row.balance > 0
                              ? 'text-rose-800'
                              : row.balance < 0
                                ? 'text-sky-800'
                                : 'text-slate-600'
                          }`}
                        >
                          {formatArrearsWon(row.balance)}
                        </button>
                      ) : (
                        <span
                          className={`tabular-nums font-semibold ${
                            row.balance > 0
                              ? 'text-rose-800'
                              : row.balance < 0
                                ? 'text-sky-800'
                                : 'text-slate-600'
                          }`}
                        >
                          {formatArrearsWon(row.balance)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700 max-w-[16rem]">
                      <span className="line-clamp-2" title={row.reasonSummary || ''}>
                        {row.reasonSummary || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <select
                          className={`${portalInput} py-1 text-xs min-w-[5.5rem] bg-white/80`}
                          value={row.managerName}
                          disabled={savingId === row.id}
                          onChange={e => void patchRow(row.id, { managerName: e.target.value })}
                        >
                          <option value="">미지정</option>
                          {managerFilterOptions.map(n => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                          {row.managerName && !managerFilterOptions.includes(row.managerName) ? (
                            <option value={row.managerName}>{row.managerName}</option>
                          ) : null}
                        </select>
                      ) : (
                        <span className="text-slate-700">{row.managerName || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <select
                          className={`${portalInput} py-1 text-xs min-w-[6rem] bg-white/80 ${arrearsCategoryChipClass(row.mgmtCategory)}`}
                          value={row.mgmtCategory}
                          disabled={savingId === row.id}
                          onChange={e =>
                            void patchRow(row.id, {
                              mgmtCategory: e.target.value as ArrearsEntryDto['mgmtCategory'],
                            })
                          }
                        >
                          <option value="">미분류</option>
                          {ARREARS_MGMT_CATEGORIES.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${arrearsCategoryChipClass(row.mgmtCategory)}`}
                        >
                          {arrearsCategoryLabel(row.mgmtCategory)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <input
                          className={`${portalInput} py-1 text-xs w-full min-w-[8rem] bg-white/80`}
                          defaultValue={row.memo}
                          key={`${row.id}:${row.updatedAt}:memo`}
                          disabled={savingId === row.id}
                          onBlur={e => {
                            const next = e.target.value;
                            if (next !== row.memo) void patchRow(row.id, { memo: next });
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <span className="text-slate-600 text-xs">{row.memo || '—'}</span>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => openManual('thebill', row.id)}
                          >
                            더빌
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => openManual('cms', row.id)}
                          >
                            CMS
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ArrearsManualEntryModal
        open={manualOpen}
        channel={manualChannel}
        entries={items}
        initialEntryId={manualEntryId}
        busy={manualBusy}
        onClose={() => setManualOpen(false)}
        onSubmit={submitManual}
      />

      <CenterModal
        open={bulkOpen}
        onClose={() => {
          if (bulkBusy) return;
          setBulkOpen(false);
        }}
        title="월 기장료 일괄 청구"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            수임처에 등록된 <b>기장수수료(월 공급가)</b>를 미수 내역에 넣습니다. VAT는 더하지
            않습니다. 같은 달 설명이 이미 있으면 건너뜁니다.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              청구 월
              <input
                type="month"
                className={portalInput}
                value={bulkYearMonth}
                onChange={e => {
                  setBulkYearMonth(e.target.value);
                  setBulkPreview(null);
                }}
                disabled={bulkBusy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              담당 (수임처 기준)
              <select
                className={portalInput}
                value={bulkManager}
                onChange={e => {
                  setBulkManager(e.target.value);
                  setBulkPreview(null);
                }}
                disabled={bulkBusy}
              >
                <option value="">전체</option>
                {managerFilterOptions.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {bulkPreview ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{bulkPreview.description}</span>
                <br />
                반영 예정 {bulkPreview.ready}건 · {formatArrearsWon(bulkPreview.readyAmount)}원 ·
                건너뜀 {bulkPreview.skipped}건
              </p>
              <div className="max-h-56 overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">수임처</th>
                      <th className="px-2 py-1.5 text-right">월 기장료</th>
                      <th className="px-2 py-1.5 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.rows.map(r => (
                      <tr key={`${r.clientId}-${r.status}`}>
                        <td className="px-2 py-1">
                          {r.clientName}
                          {r.externalCode ? (
                            <span className="ml-1 font-mono text-slate-400">{r.externalCode}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.monthlyFee ? formatArrearsWon(r.monthlyFee) : '—'}
                        </td>
                        <td
                          className={`px-2 py-1 ${
                            r.status === 'ready' ? 'text-emerald-800 font-medium' : 'text-slate-500'
                          }`}
                        >
                          {r.statusLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {bulkMsg ? <p className="text-sm text-emerald-800">{bulkMsg}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={bulkBusy}
              onClick={() => setBulkOpen(false)}
            >
              닫기
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={bulkBusy}
              onClick={() => void previewBulk()}
            >
              {bulkBusy && !bulkPreview ? '조회 중…' : '미리보기'}
            </button>
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={bulkBusy || !bulkPreview?.ready}
              onClick={() => void confirmBulk()}
            >
              {bulkBusy && bulkPreview ? '반영 중…' : '확정 반영'}
            </button>
          </div>
        </div>
      </CenterModal>
    </PortalPageShell>
  );
}
