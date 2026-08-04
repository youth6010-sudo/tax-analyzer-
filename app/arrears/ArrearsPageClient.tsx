'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ImportPreview = {
  preview: true;
  asOfDate: string;
  filename: string;
  total: number;
  matched: number;
  unmatched: number;
  newCount: number;
  /** 원장에 없어 삭제·변경되지 않는 기존 DB 행 */
  preserved?: number;
  letterDiffCount?: number;
  letterDiffSample?: Array<{
    externalCode: string;
    companyName: string;
    ledgerBalance: number;
    letterBalance: number;
    diff: number;
  }>;
  sample: Array<{
    externalCode: string;
    companyName: string;
    businessNo: string;
    balance: number;
    matchedCompanyName: string | null;
    managerName: string;
    isNew: boolean;
  }>;
};

type LetterImportPreview = {
  preview: true;
  filename: string;
  managerName: string;
  sheetCount: number;
  matched: number;
  unmatched: number;
  totalLines: number;
  sample: Array<{
    companyName: string;
    letterDate: string;
    lineCount: number;
    letterBalance: number;
    matched: boolean;
    entryId: string | null;
    matchedCompanyName: string | null;
    externalCode: string | null;
    currentBalance: number | null;
  }>;
};

type EventsImportPreview = {
  preview: true;
  filename: string;
  detected: string;
  total: number;
  matched: number;
  unmatched: number;
  sample: Array<{
    companyName: string;
    businessNo: string;
    kind: string;
    description: string;
    amount: number;
    eventDate: string;
    isPayment: boolean;
    matched: boolean;
    matchedCompanyName: string | null;
  }>;
};

type BalanceEditMode = 'pay' | 'charge' | 'set';

type BalanceEditState = {
  row: ArrearsEntryDto;
  mode: BalanceEditMode;
  amount: string;
};

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
  /** 현황 이관 직후 잔액 0이면 기본 체크 시 목록이 비어 보이므로 기본 OFF */
  const [nonzero, setNonzero] = useState(false);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const letterFileRef = useRef<HTMLInputElement>(null);
  const eventsFileRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [letterPreview, setLetterPreview] = useState<LetterImportPreview | null>(null);
  const [pendingLetterFiles, setPendingLetterFiles] = useState<File[]>([]);
  const [eventsPreview, setEventsPreview] = useState<EventsImportPreview | null>(null);
  const [pendingEventsFile, setPendingEventsFile] = useState<File | null>(null);
  const [balanceEdit, setBalanceEdit] = useState<BalanceEditState | null>(null);
  const [balanceSaving, setBalanceSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (manager) params.set('manager', manager);
    if (category !== 'all') params.set('category', category);
    if (nonzero) params.set('nonzero', '1');
    if (qDebounced) params.set('q', qDebounced);

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
  }, [manager, category, nonzero, qDebounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void load()
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const patchRow = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ArrearsEntryDto, 'managerName' | 'mgmtCategory' | 'memo' | 'balance'>> & {
        balanceAction?: 'pay' | 'charge';
        amount?: number;
      },
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
        setItems(prev => prev.map(r => (r.id === id ? item : r)));
        void load().catch(() => undefined);
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

  const applyBalanceEdit = async () => {
    if (!balanceEdit) return;
    const raw = balanceEdit.amount.replace(/,/g, '').trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setError('금액을 숫자로 입력하세요.');
      return;
    }
    setBalanceSaving(true);
    setError('');
    try {
      if (balanceEdit.mode === 'set') {
        await patchRow(balanceEdit.row.id, { balance: Math.round(n) });
      } else if (balanceEdit.mode === 'pay') {
        if (n <= 0) throw new Error('입금 금액은 0보다 커야 합니다.');
        await patchRow(balanceEdit.row.id, { balanceAction: 'pay', amount: Math.round(n) });
      } else {
        if (n <= 0) throw new Error('미수 추가 금액은 0보다 커야 합니다.');
        await patchRow(balanceEdit.row.id, { balanceAction: 'charge', amount: Math.round(n) });
      }
      setBalanceEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '금액 수정 실패');
    } finally {
      setBalanceSaving(false);
    }
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setImportBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/arrears/import', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '미리보기 실패');
      setPendingFile(file);
      setPreview(data as ImportPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기 실패');
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setImportBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', pendingFile);
      form.set('confirm', '1');
      if (preview?.asOfDate) form.set('asOfDate', preview.asOfDate);
      const res = await fetch('/api/arrears/import', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setPreview(null);
      setPendingFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setImportBusy(false);
    }
  };

  const onPickLetterFile = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setImportBusy(true);
    setError('');
    try {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      const res = await fetch('/api/arrears/import-letter', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '미리보기 실패');
      setPendingLetterFiles(files);
      setLetterPreview(data as LetterImportPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기 실패');
    } finally {
      setImportBusy(false);
      if (letterFileRef.current) letterFileRef.current.value = '';
    }
  };

  const confirmLetterImport = async () => {
    if (!pendingLetterFiles.length) return;
    setImportBusy(true);
    setError('');
    try {
      const form = new FormData();
      for (const f of pendingLetterFiles) form.append('files', f);
      form.set('confirm', '1');
      // 다중 파일은 파일명에서 담당을 읽으므로 managerName 강제하지 않음
      if (pendingLetterFiles.length === 1 && letterPreview?.managerName) {
        const only = letterPreview.managerName.split(',')[0]?.trim();
        if (only && !only.includes(',')) form.set('managerName', only);
      }
      const res = await fetch('/api/arrears/import-letter', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setLetterPreview(null);
      setPendingLetterFiles([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setImportBusy(false);
    }
  };

  const onPickEventsFile = async (file: File | null) => {
    if (!file) return;
    setImportBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/arrears/import-events', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '미리보기 실패');
      setPendingEventsFile(file);
      setEventsPreview(data as EventsImportPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기 실패');
    } finally {
      setImportBusy(false);
      if (eventsFileRef.current) eventsFileRef.current.value = '';
    }
  };

  const confirmEventsImport = async () => {
    if (!pendingEventsFile) return;
    setImportBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', pendingEventsFile);
      form.set('confirm', '1');
      const res = await fetch('/api/arrears/import-events', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setEventsPreview(null);
      setPendingEventsFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setImportBusy(false);
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
      <div className={`${portalMain} w-full py-4 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">미수관리</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              상호를 누르면 업체별 미수 공문을 볼 수 있습니다. 원장 가져오기 시 공문 잔액과 차이가
              있으면 자동 반영됩니다. 수정·가져오기는 인디·찰리만 가능하며, 담당자는 본인 분만 볼
              수 있습니다.
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={e => void onPickFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={letterFileRef}
                type="file"
                multiple
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={e => void onPickLetterFile(e.target.files)}
              />
              <input
                ref={eventsFileRef}
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={e => void onPickEventsFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={importBusy}
                onClick={() => letterFileRef.current?.click()}
              >
                공문 내역 가져오기
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={importBusy}
                onClick={() => eventsFileRef.current?.click()}
              >
                세금계산서·CMS
              </button>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={importBusy}
                onClick={() => fileRef.current?.click()}
              >
                {importBusy ? '처리 중…' : '원장 가져오기'}
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
                  setManager(m => (m === t.managerName && t.managerName !== '(미지정)' ? '' : t.managerName === '(미지정)' ? '' : t.managerName))
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
            onClick={() => void load().catch(e => setError(e instanceof Error ? e.message : '새로고침 실패'))}
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
              잔액 클릭 → 입금·미수추가·직접수정
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
                <th className="px-3 py-2.5 whitespace-nowrap">사업자번호</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">잔액</th>
                <th className="px-3 py-2.5 whitespace-nowrap">담당</th>
                <th className="px-3 py-2.5 whitespace-nowrap">관리</th>
                <th className="px-3 py-2.5 min-w-[10rem]">메모</th>
                <th className="px-3 py-2.5 whitespace-nowrap">갱신</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    표시할 미수 항목이 없습니다.
                    {nonzero
                      ? ' 「잔액 ≠ 0」 필터를 끄거나, 잔액이 있는 거래처원장을 가져와 보세요.'
                      : canManage
                        ? ' 「원장 가져오기」로 거래처원장.xls를 업로드하세요.'
                        : ''}
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
                          title="미수 공문 보기"
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
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {row.businessNo || '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canManage ? (
                        <button
                          type="button"
                          title="금액 수정"
                          disabled={savingId === row.id}
                          onClick={() =>
                            setBalanceEdit({
                              row,
                              mode: 'pay',
                              amount: '',
                            })
                          }
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
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {row.asOfDate || (row.updatedAt ? row.updatedAt.slice(0, 10) : '—')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CenterModal
        open={!!preview}
        onClose={() => {
          if (importBusy) return;
          setPreview(null);
          setPendingFile(null);
        }}
        title="원장 가져오기 미리보기"
      >
        {preview ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{preview.filename}</span>
              <br />
              기준일 {preview.asOfDate} · 총 {preview.total}건 · 수임처 매칭 {preview.matched} /
              미매칭 {preview.unmatched} · 신규 행 {preview.newCount}
              {typeof preview.preserved === 'number' ? (
                <> · 원장 밖 유지 {preview.preserved}</>
              ) : null}
            </p>
            <p className="text-xs text-slate-500">
              원장에 있는 업체만 잔액·상호·사업자번호를 갱신합니다. 담당·관리분류·메모는 유지하고,
              원장에 없는 기존(현황·공문) 행은 삭제하거나 잔액을 바꾸지 않습니다. 신규 행은 매칭된
              수임처 담당으로 채웁니다.
            </p>
            {typeof preview.letterDiffCount === 'number' && preview.letterDiffCount > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                공문 잔액과 차이 {preview.letterDiffCount}건 — 확정 시 「원장 추가미수/입금 반영」
                라인으로 자동 반영됩니다.
              </p>
            ) : null}
            <div className="max-h-56 overflow-auto rounded border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">코드</th>
                    <th className="px-2 py-1.5 text-left">상호</th>
                    <th className="px-2 py-1.5 text-right">잔액</th>
                    <th className="px-2 py-1.5 text-left">매칭</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample.map(r => (
                    <tr key={r.externalCode}>
                      <td className="px-2 py-1 font-mono">{r.externalCode}</td>
                      <td className="px-2 py-1">
                        {r.companyName}
                        {r.isNew ? (
                          <span className="ml-1 text-amber-700">신규</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatArrearsWon(r.balance)}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {r.matchedCompanyName || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={importBusy}
                onClick={() => {
                  setPreview(null);
                  setPendingFile(null);
                }}
              >
                취소
              </button>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={importBusy}
                onClick={() => void confirmImport()}
              >
                {importBusy ? '반영 중…' : '확정 반영'}
              </button>
            </div>
          </div>
        ) : null}
      </CenterModal>

      <CenterModal
        open={!!letterPreview}
        onClose={() => {
          if (importBusy) return;
          setLetterPreview(null);
          setPendingLetterFiles([]);
        }}
        title="공문 내역 가져오기 미리보기"
      >
        {letterPreview ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{letterPreview.filename}</span>
              <br />
              담당 {letterPreview.managerName || '—'} · 시트 {letterPreview.sheetCount} · 매칭{' '}
              {letterPreview.matched} / 미매칭 {letterPreview.unmatched} · 라인{' '}
              {letterPreview.totalLines}
            </p>
            <p className="text-xs text-slate-500">
              매칭된 업체의 공문 내역을 통째로 교체합니다. 확정 후 잔액은 공문 내역 합계로
              맞춰집니다. 미매칭 시트는 건너뜁니다(먼저 현황·원장으로 행을 만들어 두세요).
            </p>
            <div className="max-h-56 overflow-auto rounded border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">시트(상호)</th>
                    <th className="px-2 py-1.5 text-right">라인</th>
                    <th className="px-2 py-1.5 text-right">공문잔액</th>
                    <th className="px-2 py-1.5 text-left">매칭</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {letterPreview.sample.map(r => (
                    <tr key={`${r.companyName}-${r.externalCode || 'x'}`}>
                      <td className="px-2 py-1">{r.companyName}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.lineCount}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatArrearsWon(r.letterBalance)}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {r.matched ? r.matchedCompanyName || '✓' : (
                          <span className="text-amber-700">미매칭</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={importBusy}
                onClick={() => {
                  setLetterPreview(null);
                  setPendingLetterFiles([]);
                }}
              >
                취소
              </button>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={importBusy || letterPreview.matched === 0}
                onClick={() => void confirmLetterImport()}
              >
                {importBusy ? '반영 중…' : '확정 반영'}
              </button>
            </div>
          </div>
        ) : null}
      </CenterModal>

      <CenterModal
        open={!!eventsPreview}
        onClose={() => {
          if (importBusy) return;
          setEventsPreview(null);
          setPendingEventsFile(null);
        }}
        title="세금계산서·CMS 가져오기 미리보기"
      >
        {eventsPreview ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{eventsPreview.filename}</span>
              <br />
              형식 {eventsPreview.detected === 'cms' ? 'CMS 출금' : eventsPreview.detected === 'tax' ? '세금계산서' : '일반'} · 총{' '}
              {eventsPreview.total}건 · 매칭 {eventsPreview.matched} / 미매칭{' '}
              {eventsPreview.unmatched}
            </p>
            <p className="text-xs text-slate-500">
              CMS·입금은 공문 「지급내역」에, 세금계산서·미수는 「금액」에 행을 추가합니다.
              상호·사업자번호·코드로 매칭합니다. (홈택스 보안메일 HTML은 지원하지 않으며, 엑셀
              내보내기 파일을 올려 주세요. 공급자 사업자 7988501836)
            </p>
            <div className="max-h-56 overflow-auto rounded border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">상호</th>
                    <th className="px-2 py-1.5 text-left">구분</th>
                    <th className="px-2 py-1.5 text-right">금액</th>
                    <th className="px-2 py-1.5 text-left">매칭</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventsPreview.sample.map((r, i) => (
                    <tr key={`${r.companyName}-${r.amount}-${i}`}>
                      <td className="px-2 py-1">{r.companyName || r.businessNo || '—'}</td>
                      <td className="px-2 py-1">
                        {r.isPayment ? '입금/CMS' : r.kind === 'tax_invoice' ? '세금계산서' : '미수'}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatArrearsWon(r.amount)}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {r.matched ? r.matchedCompanyName || '✓' : (
                          <span className="text-amber-700">미매칭</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={importBusy}
                onClick={() => {
                  setEventsPreview(null);
                  setPendingEventsFile(null);
                }}
              >
                취소
              </button>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={importBusy || eventsPreview.matched === 0}
                onClick={() => void confirmEventsImport()}
              >
                {importBusy ? '반영 중…' : '확정 반영'}
              </button>
            </div>
          </div>
        ) : null}
      </CenterModal>

      <CenterModal
        open={!!balanceEdit}
        onClose={() => {
          if (balanceSaving) return;
          setBalanceEdit(null);
        }}
        title="금액 수정"
      >
        {balanceEdit ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold text-slate-900">{balanceEdit.row.companyName}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                코드 {balanceEdit.row.externalCode || '—'} · 현재 잔액{' '}
                <span className="font-semibold tabular-nums text-slate-800">
                  {formatArrearsWon(balanceEdit.row.balance)}원
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'pay' as const, label: '입금' },
                  { id: 'charge' as const, label: '미수 추가' },
                  { id: 'set' as const, label: '잔액 직접수정' },
                ] as const
              ).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBalanceEdit(s => (s ? { ...s, mode: m.id } : s))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    balanceEdit.mode === m.id
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {balanceEdit.mode === 'pay'
                ? '입금 금액'
                : balanceEdit.mode === 'charge'
                  ? '추가 미수 금액'
                  : '변경할 잔액'}
              <input
                autoFocus
                className={`${portalInput} py-2 tabular-nums`}
                inputMode="numeric"
                placeholder="예: 110000"
                value={balanceEdit.amount}
                onChange={e => setBalanceEdit(s => (s ? { ...s, amount: e.target.value } : s))}
                onKeyDown={e => {
                  if (e.key === 'Enter') void applyBalanceEdit();
                }}
              />
            </label>

            {(() => {
              const n = Number(balanceEdit.amount.replace(/,/g, '').trim());
              if (!Number.isFinite(n) || balanceEdit.amount.trim() === '') return null;
              const next =
                balanceEdit.mode === 'pay'
                  ? balanceEdit.row.balance - Math.round(n)
                  : balanceEdit.mode === 'charge'
                    ? balanceEdit.row.balance + Math.round(n)
                    : Math.round(n);
              return (
                <p className="text-xs text-slate-500">
                  변경 후 잔액{' '}
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatArrearsWon(next)}원
                  </span>
                </p>
              );
            })()}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={balanceSaving}
                onClick={() => setBalanceEdit(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={balanceSaving}
                onClick={() => void applyBalanceEdit()}
              >
                {balanceSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : null}
      </CenterModal>
    </PortalPageShell>
  );
}
