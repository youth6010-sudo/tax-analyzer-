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
  VAT_PROGRESS_DEFAULT_COLUMNS,
  VAT_PROGRESS_MARKS,
  cellDisplayValue,
  createVatProgressColumnKey,
  cycleVatColor,
  cycleVatMark,
  normalizeVatProgressLayout,
  type VatPeriodProgress,
  type VatProgressCell,
  type VatProgressColumnDef,
  type VatProgressInputKind,
} from '@/lib/vatEntryProgress';
import ReviewHubTabs from '@/app/components/clients/ReviewHubTabs';

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
  yearPhases?: VatPhase[];
  progress?: VatPeriodProgress;
  progressByPhase?: Record<string, PhaseSummary>;
  labor: Record<LaborKey, LaborSlot>;
};

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

function MarkChip({ mark }: { mark: string }) {
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

function MarkCell({
  cell,
  onChange,
}: {
  cell: VatProgressCell | undefined;
  onChange: (next: VatProgressCell) => void;
}) {
  const mark = (cell?.mark || cellDisplayValue(cell) || '') as string;
  const bg = cell?.bg || '';
  const shown = VAT_PROGRESS_MARKS.includes(mark as (typeof VAT_PROGRESS_MARKS)[number])
    ? mark
    : mark
      ? mark
      : '';
  return (
    <button
      type="button"
      title="클릭: O/X/△ · Alt+클릭: 색칠"
      onClick={e => {
        e.preventDefault();
        if (e.altKey) onChange({ mark: shown, text: '', bg: cycleVatColor(bg) });
        else onChange({ mark: cycleVatMark(shown), text: '', bg });
      }}
      className={`mx-auto flex h-8 w-10 items-center justify-center rounded border border-slate-200/80 transition hover:border-slate-300 ${
        bg ? '' : 'bg-white'
      }`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      <MarkChip mark={shown} />
    </button>
  );
}

function TextCell({
  cell,
  onChange,
}: {
  cell: VatProgressCell | undefined;
  onChange: (next: VatProgressCell) => void;
}) {
  const value = cellDisplayValue(cell);
  const bg = cell?.bg || '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    return (
      <input
        autoFocus
        className="mx-auto block h-8 w-[5.5rem] rounded border border-blue-300 px-1 text-center text-[11px] outline-none"
        style={bg ? { backgroundColor: bg } : undefined}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onChange({ text: draft.trim(), mark: '', bg });
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      title="클릭: 글자 입력 · Alt+클릭: 색칠"
      onClick={e => {
        e.preventDefault();
        if (e.altKey) {
          onChange({ text: value, mark: '', bg: cycleVatColor(bg) });
          return;
        }
        setDraft(value);
        setEditing(true);
      }}
      className={`mx-auto flex h-8 min-w-[3.5rem] max-w-[7rem] items-center justify-center truncate rounded border border-slate-200/80 px-1 text-[11px] transition hover:border-slate-300 ${
        bg ? '' : 'bg-white'
      }`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {value ? (
        <span className="truncate font-medium text-slate-800">{value}</span>
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </button>
  );
}

function ProgressCellByKind({
  input,
  cell,
  onChange,
}: {
  input: VatProgressInputKind;
  cell: VatProgressCell | undefined;
  onChange: (next: VatProgressCell) => void;
}) {
  if (input === 'mark') return <MarkCell cell={cell} onChange={onChange} />;
  return <TextCell cell={cell} onChange={onChange} />;
}

export default function VatEntryProgressBoard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [phase, setPhase] = useState<VatPhase>('1기 확정');
  const [view, setView] = useState<'period' | 'year'>('period');
  const [rows, setRows] = useState<VatProgressRow[]>([]);
  const [layout, setLayout] = useState<VatProgressColumnDef[]>(() =>
    VAT_PROGRESS_DEFAULT_COLUMNS.map(c => ({ ...c })),
  );
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [detailRow, setDetailRow] = useState<VatProgressRow | null>(null);
  const [canViewAll, setCanViewAll] = useState(false);
  const [managerFilter, setManagerFilter] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<VatProgressColumnDef[]>([]);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColInput, setNewColInput] = useState<VatProgressInputKind>('text');

  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => 2024 + i), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        year: String(year),
        phase,
        view,
      });
      const res = await fetch(`/api/clients/vat-progress?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '불러오기 실패');
      setRows((data.rows as VatProgressRow[]) ?? []);
      setCanViewAll(!!data.canViewAll);
      if (Array.isArray(data.layout)) {
        setLayout(normalizeVatProgressLayout(data.layout as VatProgressColumnDef[]));
      }
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

  const patchProgress = async (clientId: string, progress: VatPeriodProgress) => {
    const res = await fetch('/api/clients/vat-progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, year, phase, progress }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
    return data as { progress: VatPeriodProgress };
  };

  const updateProgress = async (row: VatProgressRow, key: string, cell: VatProgressCell) => {
    setRows(prev =>
      prev.map(r =>
        r.id === row.id ? { ...r, progress: { ...(r.progress ?? {}), [key]: cell } } : r,
      ),
    );
    try {
      const saved = await patchProgress(row.id, { [key]: cell });
      setRows(prev =>
        prev.map(r => (r.id === row.id ? { ...r, progress: saved.progress } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
      void load();
    }
  };

  const managerOptions = useMemo(() => {
    const names = [...new Set(rows.map(r => r.manager.trim()).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b, 'ko'));
    return names;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (canViewAll && managerFilter && r.manager.trim() !== managerFilter) return false;
      if (!needle) return true;
      const hay = [r.companyName, r.douzoneCode, r.businessNo, r.manager, r.representative]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, canViewAll, managerFilter]);

  const yearPhaseCols = useMemo(() => {
    const needed = new Set<VatPhase>();
    for (const r of filtered) {
      for (const p of r.yearPhases ?? []) needed.add(p);
    }
    if (needed.size === 0) return [...VAT_PHASES.filter(p => p.includes('확정'))];
    return VAT_PHASES.filter(p => needed.has(p));
  }, [filtered]);

  const periodColSpan = 2 + layout.length + LABOR_COLS.length;

  const openColumnEditor = () => {
    setOrderDraft(layout.map(c => ({ ...c })));
    setNewColLabel('');
    setNewColInput('text');
    setOrderOpen(true);
  };

  const addDraftColumn = () => {
    const label = newColLabel.trim();
    if (!label) return;
    setOrderDraft(prev => [
      ...prev,
      { key: createVatProgressColumnKey(), label, input: newColInput },
    ]);
    setNewColLabel('');
  };

  const moveOrderDraft = (index: number, dir: -1 | 1) => {
    setOrderDraft(prev => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  const saveLayout = async () => {
    setLayoutSaving(true);
    setError('');
    try {
        const cleaned = normalizeVatProgressLayout(
        orderDraft
          .map(c => ({
            key: c.key.trim(),
            label: c.label.trim(),
            input: (c.input === 'mark' ? 'mark' : 'text') as VatProgressInputKind,
          }))
          .filter(c => c.key && c.label),
      );
      const res = await fetch('/api/clients/vat-progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '열 저장 실패');
      const next = normalizeVatProgressLayout(
        (data as { layout?: VatProgressColumnDef[] }).layout ?? cleaned,
      );
      setLayout(next);
      setOrderOpen(false);
      if (view === 'year') void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '열 저장 실패');
    } finally {
      setLayoutSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PortalPageHeader
        title="검토표"
        description={
          canViewAll
            ? '부가세 자료입력 진행도 — 전체 담당자 (본인 열 구성 적용)'
            : '부가세 자료입력 진행도 — 내 담당 수임처'
        }
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
        {canViewAll ? (
          <label className="text-xs text-slate-500">
            담당자
            <select
              className={`${portalInput} ml-1 mt-0.5`}
              value={managerFilter}
              onChange={e => setManagerFilter(e.target.value)}
            >
              <option value="">전체</option>
              {managerOptions.map(name => (
                <option key={name} value={name}>
                  {name}
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
        <button type="button" className={portalBtnSecondary} onClick={openColumnEditor}>
          열 편집
        </button>
        <button type="button" className={portalBtnSecondary} onClick={() => void load()}>
          새로고침
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <p className="text-[11px] text-slate-500">
        O/X/△ 열은 클릭으로 전환, 자유서식 열은 글자 입력(자료요청일·특이사항 등). Alt+클릭 색칠.
        열 형식·구성은 본인 계정에 저장되며 찰리·인디 전체 조회에도 본인 열이 적용됩니다.
        {view === 'year' ? ' 연간 진행표는 예정신고 대상만 예정 칸이 보입니다.' : ''}
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
                  <td
                    colSpan={2 + yearPhaseCols.length + LABOR_COLS.length}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    불러오는 중…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + yearPhaseCols.length + LABOR_COLS.length}
                    className="px-3 py-10 text-center text-slate-400"
                  >
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
                        onClick={() => setDetailRow(row)}
                        className="text-left font-medium text-slate-800 hover:text-blue-700"
                      >
                        {row.companyName}
                      </button>
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
                {layout.map(col => (
                  <th key={col.key} className="px-1.5 py-2 text-center font-semibold">
                    {col.label}
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
                        onClick={() => setDetailRow(row)}
                        className="text-left font-medium text-slate-800 hover:text-blue-700"
                      >
                        {row.companyName}
                      </button>
                    </td>
                    {layout.map(col => (
                      <td key={col.key} className="px-1 py-1 text-center">
                        <ProgressCellByKind
                          input={col.input}
                          cell={row.progress?.[col.key]}
                          onChange={cell => void updateProgress(row, col.key, cell)}
                        />
                      </td>
                    ))}
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
        open={orderOpen}
        title="열 편집"
        description="열을 추가할 때 O/X/△ 또는 자유서식(날짜·특이사항 등)을 고를 수 있습니다. 기존 열도 형식·이름을 바꿀 수 있습니다."
        onClose={() => setOrderOpen(false)}
      >
        <div className="space-y-3">
          <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
            {orderDraft.map((col, index) => (
              <li key={col.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-5 text-center text-[11px] text-slate-400">{index + 1}</span>
                <input
                  className={`${portalInput} min-w-[7rem] flex-1 py-1 text-sm`}
                  value={col.label}
                  onChange={e =>
                    setOrderDraft(prev =>
                      prev.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)),
                    )
                  }
                />
                <select
                  className={`${portalInput} w-[7.5rem] py-1 text-xs`}
                  value={col.input}
                  onChange={e =>
                    setOrderDraft(prev =>
                      prev.map((c, i) =>
                        i === index
                          ? { ...c, input: e.target.value as VatProgressInputKind }
                          : c,
                      ),
                    )
                  }
                >
                  <option value="mark">O / X / △</option>
                  <option value="text">자유서식</option>
                </select>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => moveOrderDraft(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 disabled:opacity-30"
                  disabled={index === orderDraft.length - 1}
                  onClick={() => moveOrderDraft(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600"
                  onClick={() => setOrderDraft(prev => prev.filter((_, i) => i !== index))}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <input
              className={`${portalInput} min-w-[10rem] flex-1`}
              placeholder="예: 자료요청일, 특이사항, 입력여부"
              value={newColLabel}
              onChange={e => setNewColLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraftColumn();
                }
              }}
            />
            <select
              className={`${portalInput} w-[7.5rem]`}
              value={newColInput}
              onChange={e => setNewColInput(e.target.value as VatProgressInputKind)}
            >
              <option value="text">자유서식</option>
              <option value="mark">O / X / △</option>
            </select>
            <button type="button" className={portalBtnSecondary} onClick={addDraftColumn}>
              열 추가
            </button>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={portalBtnSecondary}
              onClick={() => setOrderDraft(VAT_PROGRESS_DEFAULT_COLUMNS.map(c => ({ ...c })))}
            >
              표준 틀로
            </button>
            <button type="button" className={portalBtnSecondary} onClick={() => setOrderOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={layoutSaving || orderDraft.length === 0}
              onClick={() => void saveLayout()}
            >
              {layoutSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal
        open={!!detailRow}
        title={detailRow?.companyName || '거래처'}
        description="사업자번호·담당 확인"
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
            <div className="flex justify-end gap-2">
              <button type="button" className={portalBtnSecondary} onClick={() => setDetailRow(null)}>
                닫기
              </button>
              <Link href={`/clients/${detailRow.id}`} className={`${portalBtnSecondary} text-center`}>
                수임처 상세
              </Link>
            </div>
          </div>
        ) : null}
      </CenterModal>
    </div>
  );
}
