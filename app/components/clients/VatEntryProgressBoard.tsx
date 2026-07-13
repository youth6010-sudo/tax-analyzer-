'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalCard,
} from '@/app/components/portal/uiClasses';
import { VAT_PHASES, type VatPhase } from '@/app/utils/filingCheck';
import { formatBusinessNo } from '@/app/utils/idFormat';
import {
  VAT_PROGRESS_LABELS,
  cycleVatColor,
  cycleVatMark,
  type VatMaterialFlags,
  type VatPeriodProgress,
  type VatProgressCell,
  type VatProgressItemKey,
} from '@/lib/vatEntryProgress';
import ReviewHubTabs from '@/app/components/clients/ReviewHubTabs';

/** 신고분별 고정 열 — 불공제는 계산서 다음에 조건부 삽입 */
const PERIOD_LEFT_KEYS = ['taxInvoice', 'invoice'] as const;
const PERIOD_RIGHT_KEYS = ['card', 'cashReceipt', 'otherEvidence'] as const;

const LABOR_COLS = [
  { key: 'employed', label: '상용' },
  { key: 'daily', label: '일용' },
  { key: 'retirement', label: '퇴직' },
  { key: 'bizIncome', label: '사업' },
  { key: 'otherTax', label: '기타' },
  { key: 'interestDividend', label: '이자배당' },
] as const;

type LaborKey = (typeof LABOR_COLS)[number]['key'];
type LaborSlot = { target: boolean; filed: boolean };

type PhaseSummary = {
  progress: VatPeriodProgress;
  summary: { done: number; total: number; filledLabels: string[] };
};

type VatProgressRow = {
  id: string;
  companyName: string;
  representative: string;
  businessNo: string;
  corporateNo: string;
  douzoneCode: string;
  manager: string;
  isCorporate?: boolean;
  flags: VatMaterialFlags;
  yearPhases?: VatPhase[];
  progress?: VatPeriodProgress;
  progressByPhase?: Record<string, PhaseSummary>;
  summary?: { done: number; total: number; filledLabels: string[] };
  labor: Record<LaborKey, LaborSlot>;
};

function FlagPills({ flags }: { flags: VatMaterialFlags }) {
  if (!flags.nonDeductible && !flags.agencySales && !flags.zeroRateSales) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {flags.nonDeductible ? (
        <span className="rounded bg-rose-50 px-1 text-[9px] font-medium text-rose-700">불공제</span>
      ) : null}
      {flags.agencySales ? (
        <span className="rounded bg-sky-50 px-1 text-[9px] font-medium text-sky-700">신용매출</span>
      ) : null}
      {flags.zeroRateSales ? (
        <span className="rounded bg-violet-50 px-1 text-[9px] font-medium text-violet-700">영세율</span>
      ) : null}
    </span>
  );
}

function CheckChip({ mark }: { mark: string }) {
  if (!mark) return <span className="text-slate-300">—</span>;
  const cls =
    mark === 'O'
      ? 'bg-emerald-100 text-emerald-800'
      : mark === 'X'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-800';
  return (
    <span className={`inline-flex min-w-[1.25rem] justify-center rounded px-1 text-[11px] font-bold ${cls}`}>
      {mark}
    </span>
  );
}

function ProgressCell({
  cell,
  onChange,
}: {
  cell: VatProgressCell | undefined;
  onChange: (next: VatProgressCell) => void;
}) {
  const mark = cell?.mark || '';
  const bg = cell?.bg || '';
  return (
    <button
      type="button"
      title="클릭: O/X/△ · Alt+클릭: 색칠"
      onClick={e => {
        e.preventDefault();
        if (e.altKey) onChange({ mark, bg: cycleVatColor(bg) });
        else onChange({ mark: cycleVatMark(mark), bg });
      }}
      className={`mx-auto flex h-8 w-10 items-center justify-center rounded border border-slate-200/80 transition hover:border-slate-300 ${
        bg ? '' : 'bg-white'
      }`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      <CheckChip mark={mark} />
    </button>
  );
}

function OptionalProgressCell({
  enabled,
  cell,
  onChange,
}: {
  enabled: boolean;
  cell: VatProgressCell | undefined;
  onChange: (next: VatProgressCell) => void;
}) {
  if (!enabled) return <span className="text-slate-300">—</span>;
  return <ProgressCell cell={cell} onChange={onChange} />;
}

function LaborBadge({ slot, label }: { slot: LaborSlot | undefined; label: string }) {
  if (!slot?.target) return <span className="text-[10px] text-slate-300">—</span>;
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        slot.filed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
      title={slot.filed ? `${label}: 올해 신고 이력 있음` : `${label}: 대상 · 올해 신고 없음`}
    >
      {slot.filed ? '신고' : '대상'}
    </span>
  );
}

function PhaseSummaryCell({
  summary,
  onOpen,
}: {
  summary: PhaseSummary | undefined;
  onOpen: () => void;
}) {
  if (!summary || summary.summary.total === 0) {
    return (
      <button type="button" onClick={onOpen} className="text-[11px] text-slate-300 hover:text-slate-500">
        —
      </button>
    );
  }
  const { done, total, filledLabels } = summary.summary;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={filledLabels.length ? filledLabels.join(', ') : '미입력'}
      className={`mx-auto block min-w-[3.5rem] rounded-lg border px-1.5 py-1 text-[11px] font-semibold transition hover:border-slate-400 ${
        done === 0
          ? 'border-slate-200 bg-white text-slate-400'
          : done >= total
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      {done}/{total}
      <span className="block text-[9px] font-normal opacity-80">{pct}%</span>
    </button>
  );
}

export default function VatEntryProgressBoard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [phase, setPhase] = useState<VatPhase>('1기 확정');
  const [view, setView] = useState<'period' | 'year'>('period');
  const [rows, setRows] = useState<VatProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [detailRow, setDetailRow] = useState<VatProgressRow | null>(null);
  const [flagDraft, setFlagDraft] = useState<VatMaterialFlags>({
    agencySales: false,
    zeroRateSales: false,
    nonDeductible: false,
  });
  const [flagSaving, setFlagSaving] = useState(false);

  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => 2024 + i), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        year: String(year),
        phase,
        mine: '1',
        view,
      });
      const res = await fetch(`/api/clients/vat-progress?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '불러오기 실패');
      setRows((data.rows as VatProgressRow[]) ?? []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [year, phase, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = async (
    clientId: string,
    body: { progress?: VatPeriodProgress; flags?: Partial<VatMaterialFlags>; phaseOverride?: VatPhase },
  ) => {
    const res = await fetch('/api/clients/vat-progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        year,
        phase: body.phaseOverride ?? phase,
        progress: body.progress,
        flags: body.flags,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
    return data as { flags: VatMaterialFlags; progress: VatPeriodProgress };
  };

  const updateProgress = async (row: VatProgressRow, key: VatProgressItemKey, cell: VatProgressCell) => {
    setRows(prev =>
      prev.map(r =>
        r.id === row.id ? { ...r, progress: { ...(r.progress ?? {}), [key]: cell } } : r,
      ),
    );
    try {
      const saved = await patchRow(row.id, { progress: { [key]: cell } });
      setRows(prev =>
        prev.map(r => (r.id === row.id ? { ...r, progress: saved.progress, flags: saved.flags } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
      void load();
    }
  };

  const openDetail = (row: VatProgressRow) => {
    setDetailRow(row);
    setFlagDraft({
      agencySales: !!row.flags.agencySales,
      zeroRateSales: !!row.flags.zeroRateSales,
      nonDeductible: !!row.flags.nonDeductible,
    });
  };

  const saveFlags = async () => {
    if (!detailRow) return;
    setFlagSaving(true);
    setError('');
    try {
      const saved = await patchRow(detailRow.id, { flags: flagDraft });
      setRows(prev =>
        prev.map(r =>
          r.id === detailRow.id ? { ...r, flags: saved.flags, progress: saved.progress } : r,
        ),
      );
      setDetailRow(null);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setFlagSaving(false);
    }
  };

  const showNonDeductibleCol = rows.some(r => r.flags.nonDeductible);
  const showAgencyCol = rows.some(r => r.flags.agencySales);
  const showZeroCol = rows.some(r => r.flags.zeroRateSales);
  const showBankCol = rows.some(r => r.isCorporate);

  const yearPhaseCols = useMemo(() => {
    const needed = new Set<VatPhase>();
    for (const r of rows) {
      for (const p of r.yearPhases ?? []) needed.add(p);
    }
    if (needed.size === 0) return [...VAT_PHASES.filter(p => p.includes('확정'))];
    return VAT_PHASES.filter(p => needed.has(p));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => {
      const hay = [r.companyName, r.douzoneCode, r.businessNo, r.manager, r.representative]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const periodColSpan =
    2 +
    PERIOD_LEFT_KEYS.length +
    (showNonDeductibleCol ? 1 : 0) +
    PERIOD_RIGHT_KEYS.length +
    (showAgencyCol ? 1 : 0) +
    (showZeroCol ? 1 : 0) +
    (showBankCol ? 1 : 0) +
    LABOR_COLS.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PortalPageHeader
        title="검토표"
        description="부가세 자료입력 진행도 — 신고대상확인 기준"
        icon={<PageHeaderIcon name="filing-check" />}
      />

      <ReviewHubTabs active="vat" />

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 font-semibold ${
              view === 'period' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
            onClick={() => setView('period')}
          >
            신고분별
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 font-semibold ${
              view === 'year' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
            onClick={() => setView('year')}
          >
            연간 진행표
          </button>
        </div>
        <label className="text-xs text-slate-500">
          연도
          <select
            className={`${portalInput} ml-1 mt-0.5`}
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
        {view === 'period' ? (
          <label className="text-xs text-slate-500">
            신고분
            <select
              className={`${portalInput} ml-1 mt-0.5`}
              value={phase}
              onChange={e => setPhase(e.target.value as VatPhase)}
            >
              {VAT_PHASES.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <input
          className={`${portalInput} min-w-[12rem] flex-1`}
          placeholder="상호·코드·사업자번호 검색"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button type="button" className={portalBtnSecondary} onClick={() => void load()}>
          새로고침
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <p className="text-[11px] text-slate-500">
        거래처명 → 사업자번호·불공제/신용매출/영세율 해당 설정. 신고대상확인에서 제외한 업체는 목록에 없습니다.
        {view === 'year'
          ? ' 연간 진행표는 예정신고 대상만 예정 칸이 보이고, 예정고지·그 외는 확정만 표시됩니다. 칸을 누르면 해당 신고분으로 이동합니다.'
          : ' 진행 칸: 클릭 O/X/△ · Alt+클릭 색칠.'}
      </p>

      <div className={`${portalCard} overflow-auto`}>
        {view === 'year' ? (
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left font-semibold">세무사랑</th>
                <th className="sticky left-[4.5rem] z-10 bg-slate-50 px-2 py-2 text-left font-semibold">거래처</th>
                {yearPhaseCols.map(p => (
                  <th key={p} className="px-2 py-2 text-center font-semibold">
                    {p}
                  </th>
                ))}
                {LABOR_COLS.map(col => (
                  <th key={col.key} className="px-1.5 py-2 text-center font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2 + yearPhaseCols.length + LABOR_COLS.length} className="px-3 py-10 text-center text-slate-400">
                    불러오는 중…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={2 + yearPhaseCols.length + LABOR_COLS.length} className="px-3 py-10 text-center text-slate-400">
                    표시할 수임처가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="sticky left-0 z-[1] bg-white px-2 py-1.5 font-mono text-[11px] text-slate-600">
                      {row.douzoneCode || '—'}
                    </td>
                    <td className="sticky left-[4.5rem] z-[1] max-w-[14rem] bg-white px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => openDetail(row)}
                        className="text-left font-medium text-slate-800 hover:text-blue-700"
                      >
                        {row.companyName}
                      </button>
                      <FlagPills flags={row.flags} />
                    </td>
                    {yearPhaseCols.map(p => {
                      const applies = (row.yearPhases ?? []).includes(p);
                      return (
                        <td key={p} className="px-1 py-1 text-center">
                          {applies ? (
                            <PhaseSummaryCell
                              summary={row.progressByPhase?.[p]}
                              onOpen={() => {
                                setPhase(p);
                                setView('period');
                              }}
                            />
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    {LABOR_COLS.map(col => (
                      <td key={col.key} className="px-1 py-1 text-center">
                        <LaborBadge slot={row.labor?.[col.key]} label={col.label} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left font-semibold">세무사랑</th>
                <th className="sticky left-[4.5rem] z-10 bg-slate-50 px-2 py-2 text-left font-semibold">거래처</th>
                {PERIOD_LEFT_KEYS.map(k => (
                  <th key={k} className="px-1.5 py-2 text-center font-semibold">
                    {VAT_PROGRESS_LABELS[k]}
                  </th>
                ))}
                {showNonDeductibleCol ? (
                  <th className="px-1.5 py-2 text-center font-semibold">불공제</th>
                ) : null}
                {PERIOD_RIGHT_KEYS.map(k => (
                  <th key={k} className="px-1.5 py-2 text-center font-semibold">
                    {VAT_PROGRESS_LABELS[k]}
                  </th>
                ))}
                {showAgencyCol ? (
                  <th className="px-1.5 py-2 text-center font-semibold">신용매출</th>
                ) : null}
                {showZeroCol ? (
                  <th className="px-1.5 py-2 text-center font-semibold">영세율매출</th>
                ) : null}
                {showBankCol ? (
                  <th className="px-1.5 py-2 text-center font-semibold">통장내역</th>
                ) : null}
                {LABOR_COLS.map(col => (
                  <th key={col.key} className="px-1.5 py-2 text-center font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={periodColSpan} className="px-3 py-10 text-center text-slate-400">
                    불러오는 중…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={periodColSpan} className="px-3 py-10 text-center text-slate-400">
                    표시할 수임처가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="sticky left-0 z-[1] bg-white px-2 py-1.5 font-mono text-[11px] text-slate-600">
                      {row.douzoneCode || '—'}
                    </td>
                    <td className="sticky left-[4.5rem] z-[1] max-w-[14rem] bg-white px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => openDetail(row)}
                        className="text-left font-medium text-slate-800 hover:text-blue-700"
                      >
                        {row.companyName}
                      </button>
                      <FlagPills flags={row.flags} />
                    </td>
                    {PERIOD_LEFT_KEYS.map(k => (
                      <td key={k} className="px-1 py-1 text-center">
                        <ProgressCell
                          cell={row.progress?.[k]}
                          onChange={cell => void updateProgress(row, k, cell)}
                        />
                      </td>
                    ))}
                    {showNonDeductibleCol ? (
                      <td className="px-1 py-1 text-center">
                        <OptionalProgressCell
                          enabled={row.flags.nonDeductible}
                          cell={row.progress?.nonDeductible}
                          onChange={cell => void updateProgress(row, 'nonDeductible', cell)}
                        />
                      </td>
                    ) : null}
                    {PERIOD_RIGHT_KEYS.map(k => (
                      <td key={k} className="px-1 py-1 text-center">
                        <ProgressCell
                          cell={row.progress?.[k]}
                          onChange={cell => void updateProgress(row, k, cell)}
                        />
                      </td>
                    ))}
                    {showAgencyCol ? (
                      <td className="px-1 py-1 text-center">
                        <OptionalProgressCell
                          enabled={row.flags.agencySales}
                          cell={row.progress?.agencySales}
                          onChange={cell => void updateProgress(row, 'agencySales', cell)}
                        />
                      </td>
                    ) : null}
                    {showZeroCol ? (
                      <td className="px-1 py-1 text-center">
                        <OptionalProgressCell
                          enabled={row.flags.zeroRateSales}
                          cell={row.progress?.zeroRateSales}
                          onChange={cell => void updateProgress(row, 'zeroRateSales', cell)}
                        />
                      </td>
                    ) : null}
                    {showBankCol ? (
                      <td className="px-1 py-1 text-center">
                        <OptionalProgressCell
                          enabled={!!row.isCorporate}
                          cell={row.progress?.bankStatement}
                          onChange={cell => void updateProgress(row, 'bankStatement', cell)}
                        />
                      </td>
                    ) : null}
                    {LABOR_COLS.map(col => (
                      <td key={col.key} className="px-1 py-1 text-center">
                        <LaborBadge slot={row.labor?.[col.key]} label={col.label} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <CenterModal
        open={!!detailRow}
        title={detailRow?.companyName || '거래처'}
        description="사업자번호 확인 · 불공제/신용매출/영세율 해당 시 진행 열이 활성화됩니다."
        onClose={() => setDetailRow(null)}
      >
        {detailRow ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-[5.5rem_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">세무사랑</dt>
              <dd className="font-mono text-slate-800">{detailRow.douzoneCode || '—'}</dd>
              <dt className="text-slate-500">사업자번호</dt>
              <dd className="tabular-nums text-slate-800">
                {detailRow.businessNo ? formatBusinessNo(detailRow.businessNo) : '—'}
              </dd>
              <dt className="text-slate-500">담당</dt>
              <dd className="text-slate-800">{detailRow.manager || '—'}</dd>
            </dl>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">부가세 해당 항목</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={flagDraft.nonDeductible}
                  onChange={e => setFlagDraft(prev => ({ ...prev, nonDeductible: e.target.checked }))}
                />
                불공제 해당
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={flagDraft.agencySales}
                  onChange={e => setFlagDraft(prev => ({ ...prev, agencySales: e.target.checked }))}
                />
                신용매출 해당
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={flagDraft.zeroRateSales}
                  onChange={e => setFlagDraft(prev => ({ ...prev, zeroRateSales: e.target.checked }))}
                />
                영세율매출 해당
              </label>
            </div>

            {view === 'year' && detailRow.progressByPhase ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">연간 입력 요약</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {(detailRow.yearPhases ?? Object.keys(detailRow.progressByPhase)).map(p => {
                    const s = detailRow.progressByPhase?.[p]?.summary;
                    return (
                      <li key={p} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span>{p}</span>
                        <span className="text-right">
                          {s ? `${s.done}/${s.total}` : '0'}
                          {s?.filledLabels?.length ? (
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {s.filledLabels.join(' · ')}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" className={portalBtnSecondary} onClick={() => setDetailRow(null)}>
                닫기
              </button>
              <Link href={`/clients/${detailRow.id}`} className={`${portalBtnSecondary} text-center`}>
                수임처 상세
              </Link>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={flagSaving}
                onClick={() => void saveFlags()}
              >
                {flagSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : null}
      </CenterModal>
    </div>
  );
}
