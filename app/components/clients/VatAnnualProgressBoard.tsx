'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  portalBtnSecondary,
  portalInput,
  portalCard,
} from '@/app/components/portal/uiClasses';
import { formatBusinessNo } from '@/app/utils/idFormat';
import ReviewHubTabs from '@/app/components/clients/ReviewHubTabs';
import { VAT_PHASES, type VatPhase } from '@/app/utils/filingCheck';
import {
  INSURANCE4_KEY,
  BANK_QUARTER_HINTS,
  BANK_QUARTER_LABELS,
  VAT_ANNUAL_TRACKS,
  bankQuartersPct,
  bankQuartersThroughMonth,
  buildVatLineStatusFromPhaseMarks,
  normalizeBankQuarters,
  rebuildVatLinesTrackFromLines,
  summarizeVatAnnualProgress,
  syncPairedProvisionalAfterWrite,
  toggleOtherEntryMark,
  toggleOtherReceiveMark,
  toggleReceiveEntryQuarter,
  type VatAnnualLaborItem,
  type VatAnnualLineStatus,
  type VatAnnualMarkStatus,
  type VatAnnualProgressSummary,
  type VatAnnualTrackStatus,
  type VatAnnualYearState,
} from '@/lib/vatAnnualProgress';
import { cycleVatMark } from '@/lib/vatEntryProgress';
import {
  applyFilingCheckOrderToRows,
  FILING_CHECK_CLIENT_ORDER_STORAGE_KEY,
  filingCheckOrderTaxKey,
  MANAGER_CLIENT_ORDER_STORAGE_KEY,
  MANAGER_ORDER_STORAGE_KEY,
  readManagerOrder,
} from '@/app/utils/clientListPrefs';
import { CLIENT_MAIN_CATEGORIES, type ClientMainCategory } from '@/app/utils/clientsGrouping';
import { DEFAULT_CATEGORY_FILTERS } from '@/app/utils/clientsListState';

type AnnualRow = {
  id: string;
  companyName: string;
  representative: string;
  businessNo: string;
  douzoneCode: string;
  manager: string;
  isCorporate?: boolean;
  mainCategory?: ClientMainCategory | null;
  annual: VatAnnualYearState;
  annualSummary: VatAnnualProgressSummary;
};

function OverallUnderName({ summary }: { summary: VatAnnualProgressSummary }) {
  return (
    <div className="mx-auto mt-1 w-full min-w-0">
      <div className="mb-0.5 flex justify-between text-[10px] text-slate-500">
        <span>전체</span>
        <span className="tabular-nums font-semibold text-slate-700">{summary.pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            summary.pct >= 100 ? 'bg-emerald-500' : summary.pct > 0 ? 'bg-sky-500' : 'bg-slate-200'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, summary.pct))}%` }}
        />
      </div>
    </div>
  );
}

function markCellClass(mark: VatAnnualMarkStatus): string {
  if (mark === 'O') return 'bg-emerald-500 text-white hover:bg-emerald-600';
  if (mark === 'X') return 'bg-rose-500 text-white hover:bg-rose-600';
  if (mark === '△') return 'bg-amber-400 text-amber-950 hover:bg-amber-500';
  return 'bg-slate-100 text-slate-400 hover:bg-slate-200';
}

/** 세금계산서(5글자) 기준 — 계산서는 세·계·서 자리에 계·산·서 */
const INVOICE_LABEL_SLOTS: Record<string, (string | null)[]> = {
  taxInvoice: ['세', '금', '계', '산', '서'],
  invoice: ['계', null, '산', null, '서'],
};

function VatAlignedLabel({ lineKey, label }: { lineKey: string; label: string }) {
  const slots = INVOICE_LABEL_SLOTS[lineKey];
  if (!slots) {
    return (
      <span className="whitespace-nowrap text-left text-[9px] font-bold leading-none text-slate-600">
        {label}
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 grid-cols-5 text-left text-[9px] font-bold leading-none text-slate-600"
      title={label}
      aria-label={label}
    >
      {slots.map((ch, i) => (
        <span key={i} className="inline-flex w-[1em] justify-center">
          {ch ?? ''}
        </span>
      ))}
    </span>
  );
}

/** 세금계산서·카드 등 — 체크는 바로 옆 */
function VatMarkQuarterButtons({
  line,
  onCycle,
}: {
  line: VatAnnualLineStatus;
  onCycle: (phaseIndex: number) => void;
}) {
  const marks = line.phaseMarks ?? (['', '', '', ''] as VatAnnualMarkStatus[]);
  return (
    <div className="flex shrink-0 gap-0.5">
      {BANK_QUARTER_LABELS.map((lab, i) => {
        const mark = marks[i] ?? '';
        const hint = BANK_QUARTER_HINTS[i] ?? lab;
        return (
          <button
            key={lab}
            type="button"
            title={`${line.label} ${hint} ${mark || '빈칸'} — 클릭하면 O/X/△ 순환`}
            onClick={() => onCycle(i)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none transition ${markCellClass(mark)}`}
          >
            {mark || lab}
          </button>
        );
      })}
    </div>
  );
}

function VatLinesCell({
  track,
  onCycleLine,
}: {
  track: VatAnnualTrackStatus;
  onCycleLine: (lineKey: string, phaseIndex: number) => void;
}) {
  const lines = track.lines ?? [];
  if (lines.length === 0) return <span className="text-[10px] text-slate-300">—</span>;
  return (
    <div className="inline-grid grid-cols-[max-content_max-content] items-center gap-x-1 gap-y-0.5">
      {lines.map(line => (
        <div key={line.key} className="contents">
          <VatAlignedLabel lineKey={line.key} label={line.label} />
          <VatMarkQuarterButtons
            line={line}
            onCycle={phaseIndex => onCycleLine(line.key, phaseIndex)}
          />
        </div>
      ))}
    </div>
  );
}

function LaborItemChip({
  item,
  onToggle,
}: {
  item: VatAnnualLaborItem;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={item.journaled ? `${item.label}: 분개 완료 (클릭 해제)` : `${item.label}: 클릭하면 분개`}
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
        item.journaled
          ? 'bg-emerald-600 text-white ring-1 ring-emerald-700'
          : item.filed
            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200'
      }`}
    >
      {item.label}
      {item.journaled ? ' ✓' : ''}
    </button>
  );
}

function LaborCell({
  track,
  onToggleItem,
}: {
  track: VatAnnualTrackStatus;
  onToggleItem: (key: string, next: boolean) => void;
}) {
  if (!track.applicable || !track.laborItems?.length) {
    return <span className="block text-center text-[10px] text-slate-300">해당없음</span>;
  }
  const main = track.laborItems.filter(i => i.key !== INSURANCE4_KEY);
  const insurance = track.laborItems.filter(i => i.key === INSURANCE4_KEY);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-wrap justify-center gap-1">
        {main.map(item => (
          <LaborItemChip
            key={item.key}
            item={item}
            onToggle={() => onToggleItem(item.key, !item.journaled)}
          />
        ))}
      </div>
      {insurance.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1">
          {insurance.map(item => (
            <LaborItemChip
              key={item.key}
              item={item}
              onToggle={() => onToggleItem(item.key, !item.journaled)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BankQuarterRow({
  label,
  quarters,
  noneQuarters,
  allowNone,
  onToggle,
}: {
  label: string;
  quarters: boolean[];
  noneQuarters?: boolean[];
  /** 수취행에서 X(없음) 순환 */
  allowNone?: boolean;
  onToggle: (index: number) => void;
}) {
  const q = normalizeBankQuarters(quarters);
  const none = normalizeBankQuarters(noneQuarters);
  return (
    <div className="mx-auto flex w-fit items-center gap-0.5 whitespace-nowrap">
      <span className="w-6 shrink-0 text-left text-[9px] font-bold text-slate-600" title={label}>
        {label}
      </span>
      <div className="flex shrink-0 gap-0.5">
        {BANK_QUARTER_LABELS.map((lab, i) => {
          const hint = BANK_QUARTER_HINTS[i] ?? lab;
          const isNone = allowNone && !!none[i];
          const on = !!q[i];
          return (
            <button
              key={lab}
              type="button"
              title={
                allowNone
                  ? `${label} ${hint} — 클릭: 수취→없음(X)→해제`
                  : `${label} ${hint} ${on ? '완료 — 클릭하면 취소' : '클릭하면 체크'}`
              }
              onClick={() => onToggle(i)}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none transition ${
                isNone
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : on
                    ? 'bg-sky-500 text-white hover:bg-sky-600'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              }`}
            >
              {isNone ? 'X' : on ? '✓' : lab}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DualQuarterCell({
  track,
  onToggleReceive,
  onToggleEntry,
}: {
  track: VatAnnualTrackStatus;
  onToggleReceive: (index: number) => void;
  onToggleEntry: (index: number) => void;
}) {
  if (track.bankNa || !track.applicable) {
    return <span className="block text-center text-[10px] text-slate-300">해당없음</span>;
  }
  const allowNone = track.progressKey === 'otherEvidence';
  const noneQuarters = (track.phaseMarks ?? []).map(m => m === 'X');
  const receiveVisual = (track.phaseMarks ?? []).map(m => m === '△' || m === 'O');
  // 수취 X면 입력도 X로 표시
  const entryVisual = (track.phaseMarks ?? []).map(m => m === 'O');
  const entryNone = allowNone ? noneQuarters : undefined;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <BankQuarterRow
        label="수취"
        quarters={allowNone ? receiveVisual : (track.bankReceiveQuarters ?? [])}
        noneQuarters={allowNone ? noneQuarters : undefined}
        allowNone={allowNone}
        onToggle={onToggleReceive}
      />
      <BankQuarterRow
        label="입력"
        quarters={allowNone ? entryVisual : (track.bankEntryQuarters ?? [])}
        noneQuarters={entryNone}
        allowNone={allowNone}
        onToggle={onToggleEntry}
      />
    </div>
  );
}

function rebuildSummary(
  tracks: VatAnnualTrackStatus[],
  annual: VatAnnualYearState,
): VatAnnualProgressSummary {
  const nextTracks = tracks.map(t => {
    if (t.kind === 'labor') {
      return {
        ...t,
        laborItems: (t.laborItems ?? []).map(i => ({
          ...i,
          journaled: annual.laborJournal?.[i.key] === true,
        })),
      };
    }
    if (t.kind === 'dual' || t.kind === 'bank' || t.kind === 'other') {
      // dual은 vatEntryProgress에서 오므로 annual 패치로는 분기만 낙관 갱신하지 않음
      // (patchDual 쪽에서 tracks를 직접 갱신)
      if (t.key === 'bank' && !t.bankNa) {
        const receiveQ = normalizeBankQuarters(
          annual.bankReceiveQuarters ?? t.bankReceiveQuarters,
        );
        const entryQ = normalizeBankQuarters(annual.bankEntryQuarters ?? t.bankEntryQuarters);
        const receiveMonth = bankQuartersThroughMonth(receiveQ);
        const entryMonth = bankQuartersThroughMonth(entryQ);
        const receivePct = bankQuartersPct(receiveQ);
        const entryPct = bankQuartersPct(entryQ);
        return {
          ...t,
          bankReceiveQuarters: receiveQ,
          bankEntryQuarters: entryQ,
          throughMonth: Math.round((receiveMonth + entryMonth) / 2),
          pct: Math.round((receivePct + entryPct) / 2),
        };
      }
      return t;
    }
    return t;
  });
  return summarizeVatAnnualProgress(nextTracks, annual);
}

function applyPhaseMarksLocally(
  tracks: VatAnnualTrackStatus[],
  lineKey: string,
  phaseIndex: number,
  nextMark: VatAnnualMarkStatus,
): VatAnnualTrackStatus[] {
  return tracks.map(t => {
    if (t.kind === 'bank' || t.kind === 'labor') return t;
    const lines = (t.lines ?? []).map(line => {
      if (line.key !== lineKey) return line;
      const marks = [...(line.phaseMarks ?? (['', '', '', ''] as VatAnnualMarkStatus[]))];
      while (marks.length < 4) marks.push('');
      const previousConfirmed = marks[phaseIndex] ?? '';
      marks[phaseIndex] = nextMark;
      const synced = syncPairedProvisionalAfterWrite(marks, phaseIndex, previousConfirmed);
      return buildVatLineStatusFromPhaseMarks(line.key, line.label, synced);
    });
    return rebuildVatLinesTrackFromLines(t, lines);
  });
}

export default function VatAnnualProgressBoard() {
  const [year, setYear] = useState(2026);
  const [rows, setRows] = useState<AnnualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [detailRow, setDetailRow] = useState<AnnualRow | null>(null);
  const [canViewAll, setCanViewAll] = useState(false);
  const [managerFilter, setManagerFilter] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([...DEFAULT_CATEGORY_FILTERS]);
  const [orderTick, setOrderTick] = useState(0);

  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => 2024 + i), []);

  useEffect(() => {
    const bump = () => setOrderTick(v => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === FILING_CHECK_CLIENT_ORDER_STORAGE_KEY ||
        e.key === MANAGER_CLIENT_ORDER_STORAGE_KEY ||
        e.key === MANAGER_ORDER_STORAGE_KEY
      ) {
        bump();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(`local-storage:${FILING_CHECK_CLIENT_ORDER_STORAGE_KEY}`, bump);
    window.addEventListener(`local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`, bump);
    window.addEventListener(`local-storage:${MANAGER_ORDER_STORAGE_KEY}`, bump);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(`local-storage:${FILING_CHECK_CLIENT_ORDER_STORAGE_KEY}`, bump);
      window.removeEventListener(`local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`, bump);
      window.removeEventListener(`local-storage:${MANAGER_ORDER_STORAGE_KEY}`, bump);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        year: String(year),
        phase: '1기 확정',
        view: 'annual',
      });
      const res = await fetch(`/api/clients/vat-progress?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '불러오기 실패');
      setRows((data.rows as AnnualRow[]) ?? []);
      setCanViewAll(!!data.canViewAll);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyAnnualLocally = (rowId: string, annual: VatAnnualYearState) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;
        const annualSummary = rebuildSummary(r.annualSummary.tracks, annual);
        return { ...r, annual, annualSummary };
      }),
    );
  };

  const applySummaryLocally = (
    rowId: string,
    annualSummary: VatAnnualProgressSummary,
    annual?: VatAnnualYearState,
  ) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          annual: annual ?? r.annual,
          annualSummary,
        };
      }),
    );
  };

  const patchAnnual = async (row: AnnualRow, patch: Partial<VatAnnualYearState>) => {
    const prev = row.annual;
    const optimistic: VatAnnualYearState = {
      laborJournal: { ...(prev.laborJournal || {}) },
      bankReceiveQuarters: normalizeBankQuarters(
        patch.bankReceiveQuarters ?? prev.bankReceiveQuarters,
      ),
      bankEntryQuarters: normalizeBankQuarters(patch.bankEntryQuarters ?? prev.bankEntryQuarters),
      preliminaryReport:
        patch.preliminaryReport !== undefined ? patch.preliminaryReport : !!prev.preliminaryReport,
      preliminaryReportDate:
        patch.preliminaryReport === false
          ? ''
          : patch.preliminaryReportDate !== undefined
            ? patch.preliminaryReportDate
            : patch.preliminaryReport === true && !prev.preliminaryReportDate
              ? new Date().toISOString().slice(0, 10)
              : prev.preliminaryReportDate || '',
      report: patch.report !== undefined ? patch.report : !!prev.report,
      reportDate:
        patch.report === false
          ? ''
          : patch.reportDate !== undefined
            ? patch.reportDate
            : patch.report === true && !prev.reportDate
              ? new Date().toISOString().slice(0, 10)
              : prev.reportDate || '',
    };
    if (patch.laborJournal) {
      for (const [k, v] of Object.entries(patch.laborJournal)) {
        if (v) optimistic.laborJournal![k] = true;
        else delete optimistic.laborJournal![k];
      }
    }
    applyAnnualLocally(row.id, optimistic);

    try {
      const res = await fetch('/api/clients/vat-progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: row.id, year, annual: patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      if ((data as { annualSummary?: VatAnnualProgressSummary }).annualSummary) {
        applySummaryLocally(
          row.id,
          (data as { annualSummary: VatAnnualProgressSummary }).annualSummary,
          (data as { annual?: VatAnnualYearState }).annual,
        );
      } else if ((data as { annual?: VatAnnualYearState }).annual) {
        applyAnnualLocally(row.id, (data as { annual: VatAnnualYearState }).annual);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
      void load();
    }
  };

  const patchDual = async (
    row: AnnualRow,
    track: VatAnnualTrackStatus,
    which: 'receive' | 'entry',
    index: number,
  ) => {
    const progressKey = track.progressKey;
    if (!progressKey) return;

    const isOther = progressKey === 'otherEvidence';
    let bodyPayload: Record<string, unknown>;
    let optimisticTracks: VatAnnualTrackStatus[];

    if (isOther) {
      const nextMarks =
        which === 'receive'
          ? toggleOtherReceiveMark(track.phaseMarks, index)
          : toggleOtherEntryMark(track.phaseMarks, index);
      bodyPayload = {
        clientId: row.id,
        year,
        dualQuarter: { progressKey, phaseMarks: nextMarks },
      };
      optimisticTracks = row.annualSummary.tracks.map(t => {
        if (t.key !== track.key) return t;
        return {
          ...t,
          phaseMarks: nextMarks,
          exists: nextMarks.some(Boolean),
          bankReceiveQuarters: nextMarks.map(m => m === '△' || m === 'O'),
          bankEntryQuarters: nextMarks.map(m => m === 'O'),
        };
      });
      applySummaryLocally(row.id, summarizeVatAnnualProgress(optimisticTracks, row.annual));
    } else {
      const toggled = toggleReceiveEntryQuarter(
        track.bankReceiveQuarters,
        track.bankEntryQuarters,
        which,
        index,
      );
      bodyPayload = {
        clientId: row.id,
        year,
        dualQuarter: {
          progressKey,
          receiveQuarters: toggled.receive,
          entryQuarters: toggled.entry,
        },
      };
      optimisticTracks = row.annualSummary.tracks.map(t => {
        if (t.key !== track.key) return t;
        const receiveMonth = bankQuartersThroughMonth(toggled.receive);
        const entryMonth = bankQuartersThroughMonth(toggled.entry);
        const receivePct = bankQuartersPct(toggled.receive);
        const entryPct = bankQuartersPct(toggled.entry);
        return {
          ...t,
          bankReceiveQuarters: toggled.receive,
          bankEntryQuarters: toggled.entry,
          throughMonth: Math.round((receiveMonth + entryMonth) / 2),
          pct: Math.round((receivePct + entryPct) / 2),
          exists: toggled.receive.some(Boolean) || toggled.entry.some(Boolean),
        };
      });
      const optimisticAnnual: VatAnnualYearState = {
        ...row.annual,
        bankReceiveQuarters: toggled.receive,
        bankEntryQuarters: toggled.entry,
      };
      applySummaryLocally(
        row.id,
        summarizeVatAnnualProgress(optimisticTracks, optimisticAnnual),
        optimisticAnnual,
      );
    }

    try {
      const res = await fetch('/api/clients/vat-progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      if ((data as { annualSummary?: VatAnnualProgressSummary }).annualSummary) {
        applySummaryLocally(
          row.id,
          (data as { annualSummary: VatAnnualProgressSummary }).annualSummary,
          (data as { annual?: VatAnnualYearState }).annual,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
      void load();
    }
  };

  const patchVatMark = async (row: AnnualRow, lineKey: string, phaseIndex: number) => {
    const phase = VAT_PHASES[phaseIndex] as VatPhase | undefined;
    if (!phase) return;
    const track = row.annualSummary.tracks.find(t => t.lines?.some(l => l.key === lineKey));
    const line = track?.lines?.find(l => l.key === lineKey);
    const current = line?.phaseMarks?.[phaseIndex] ?? '';
    const nextMark = cycleVatMark(current) as VatAnnualMarkStatus;

    const optimisticTracks = applyPhaseMarksLocally(
      row.annualSummary.tracks,
      lineKey,
      phaseIndex,
      nextMark,
    );
    applySummaryLocally(row.id, summarizeVatAnnualProgress(optimisticTracks, row.annual));

    try {
      const res = await fetch('/api/clients/vat-progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: row.id,
          year,
          phase,
          progress: { [lineKey]: nextMark ? { mark: nextMark, text: '' } : { mark: '', text: '' } },
          includeAnnual: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      if ((data as { annualSummary?: VatAnnualProgressSummary }).annualSummary) {
        applySummaryLocally(
          row.id,
          (data as { annualSummary: VatAnnualProgressSummary }).annualSummary,
          (data as { annual?: VatAnnualYearState }).annual,
        );
      }
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

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of CLIENT_MAIN_CATEGORIES) counts.set(cat, 0);
    for (const r of rows) {
      const cat = r.mainCategory;
      if (cat && counts.has(cat)) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const allCatsSelected =
      categoryFilters.length >= CLIENT_MAIN_CATEGORIES.length &&
      CLIENT_MAIN_CATEGORIES.every(c => categoryFilters.includes(c));
    const matched = rows.filter(r => {
      if (canViewAll && managerFilter && r.manager.trim() !== managerFilter) return false;
      if (categoryFilters.length > 0 && !allCatsSelected) {
        if (!r.mainCategory || !categoryFilters.includes(r.mainCategory)) return false;
      }
      if (!needle) return true;
      const hay = [r.companyName, r.douzoneCode, r.businessNo, r.manager, r.representative]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
    return applyFilingCheckOrderToRows(matched, filingCheckOrderTaxKey('vat', '1기 확정'), {
      managerFilter: canViewAll && managerFilter ? managerFilter : undefined,
      managerOrder: readManagerOrder(),
    });
  }, [rows, q, canViewAll, managerFilter, categoryFilters, orderTick]);

  const toggleCategoryFilter = (cat: string, nextActive: boolean) => {
    setCategoryFilters(prev => {
      if (nextActive) return [...new Set([...prev, cat])];
      return prev.filter(c => c !== cat);
    });
  };

  const compactChip = (active: boolean) =>
    [
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
      active
        ? 'bg-slate-800 text-white shadow-sm'
        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
    ].join(' ');

  const compactChipCount = (active: boolean) =>
    `tabular-nums text-[10px] ${active ? 'text-slate-200' : 'text-slate-400'}`;

  const dataTracks = VAT_ANNUAL_TRACKS;
  const colSpan = 2 + dataTracks.length + 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PortalPageHeader
        title="검토표"
        description={
          canViewAll
            ? '연간진행표 — 부가세 OX 상호연동 · 원천(연말정산) 분개 (전체)'
            : '연간진행표 — 부가세 OX 상호연동 · 원천(연말정산) 분개 (내 담당)'
        }
        icon={<PageHeaderIcon name="filing-check" />}
      />

      <ReviewHubTabs active="annual" />

      <div className="flex flex-wrap items-end gap-2">
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
        <button type="button" className={portalBtnSecondary} onClick={() => void load()}>
          새로고침
        </button>
      </div>

      <div className={`${portalCard} shrink-0 px-3 py-2`}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500">대분류</span>
          <span className="text-[10px] text-slate-400">기본 개인·법인 · 비어 있으면 전체</span>
          <button
            type="button"
            onClick={() => setCategoryFilters([...CLIENT_MAIN_CATEGORIES])}
            className={`${portalBtnSecondary} !ml-auto !px-2 !py-0.5 text-[11px]`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilters([])}
            className={`${portalBtnSecondary} !px-2 !py-0.5 text-[11px]`}
          >
            해제
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {CLIENT_MAIN_CATEGORIES.map(cat => {
            const count = categoryCounts.get(cat) ?? 0;
            const active = categoryFilters.length > 0 && categoryFilters.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategoryFilter(cat, !active)}
                className={[compactChip(active), count === 0 && !active ? 'opacity-40' : ''].join(
                  ' ',
                )}
              >
                {cat}
                <span className={compactChipCount(active)}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <p className="text-[11px] text-slate-500">
        신고대상확인(부가세)에서 제외하지 않은 업체. 열 순서: 세금계산서/계산서 → 홈택스(카드/현금) → 통장 → 기타증빙 →
        원천. 확정 체크 시 예정이 비면 예정까지 같이 저장(예정에 값이 있으면 유지).
      </p>

      <div className={`${portalCard} max-h-[calc(100dvh-12rem)] overflow-auto`}>
        <table className="w-max min-w-full border-collapse text-sm">
          <colgroup>
            <col className="w-14" />
            <col className="min-w-[11rem] w-[13rem]" />
            {dataTracks.map(t => (
              <col
                key={t.key}
                style={
                  t.key === 'withholding'
                    ? { width: '9.5rem' }
                    : t.key === 'invoices'
                      ? { width: '10rem' }
                      : t.key === 'hometax'
                        ? { width: '8.25rem' }
                        : { width: '7.75rem' }
                }
              />
            ))}
            <col className="w-20" />
            <col className="w-20" />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-slate-300 bg-slate-100 text-[11px] text-slate-700 shadow-[0_1px_0_0_rgb(203,213,225)]">
              <th className="sticky top-0 z-20 border-r border-slate-200 bg-slate-100 px-1 py-2 text-center font-semibold">
                코드
              </th>
              <th className="sticky top-0 z-20 border-r border-slate-200 bg-slate-100 px-1.5 py-2 text-center font-semibold">
                거래처
              </th>
              {dataTracks.map((t, i) => (
                <th
                  key={t.key}
                  className={`sticky top-0 z-20 border-r border-slate-200 px-0.5 py-2 text-center font-semibold leading-tight ${
                    i % 2 === 0 ? 'bg-slate-100' : 'bg-slate-50'
                  }`}
                >
                  {t.label}
                </th>
              ))}
              <th className="sticky top-0 z-20 border-r border-slate-200 bg-slate-100 px-1 py-2 text-center font-semibold">
                가결산
              </th>
              <th className="sticky top-0 z-20 bg-slate-100 px-1 py-2 text-center font-semibold">
                보고서
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-10 text-center text-slate-400">
                  불러오는 중…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-10 text-center text-slate-400">
                  표시할 수임처가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map(row => {
                const byKey = new Map(row.annualSummary.tracks.map(t => [t.key, t] as const));
                return (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-sky-50/40">
                    <td className="border-r border-slate-100 px-1 py-1.5 text-center align-middle font-mono text-[10px] text-slate-500">
                      {row.douzoneCode || '—'}
                    </td>
                    <td className="border-r border-slate-100 px-1.5 py-1.5 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => setDetailRow(row)}
                        className="block w-full whitespace-normal break-keep text-center text-[13px] font-medium leading-snug text-slate-800 hover:text-blue-700"
                        title={row.companyName}
                      >
                        {row.companyName}
                      </button>
                      <OverallUnderName summary={row.annualSummary} />
                    </td>
                    {dataTracks.map((def, i) => {
                      const track = byKey.get(def.key);
                      const colBg = i % 2 === 0 ? 'bg-slate-50/80' : 'bg-white';
                      const cellClass = `border-r border-slate-100 px-0.5 py-1.5 text-center align-middle overflow-hidden ${colBg}`;
                      if (!track) {
                        return (
                          <td key={def.key} className={cellClass}>
                            —
                          </td>
                        );
                      }
                      if (track.kind === 'labor') {
                        return (
                          <td key={def.key} className={cellClass}>
                            <LaborCell
                              track={track}
                              onToggleItem={(key, next) =>
                                void patchAnnual(row, { laborJournal: { [key]: next } })
                              }
                            />
                          </td>
                        );
                      }
                      if (
                        track.kind === 'dual' ||
                        track.kind === 'bank' ||
                        track.kind === 'other'
                      ) {
                        return (
                          <td key={def.key} className={cellClass}>
                            <DualQuarterCell
                              track={track}
                              onToggleReceive={index =>
                                void patchDual(row, track, 'receive', index)
                              }
                              onToggleEntry={index => void patchDual(row, track, 'entry', index)}
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={def.key} className={cellClass}>
                          <VatLinesCell
                            track={track}
                            onCycleLine={(lineKey, phaseIndex) =>
                              void patchVatMark(row, lineKey, phaseIndex)
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="border-r border-slate-100 px-1 py-1.5 text-center align-middle">
                      <label className="inline-flex cursor-pointer flex-col items-center justify-center gap-0 text-[10px] font-medium leading-tight text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300"
                            checked={!!row.annualSummary.preliminaryReport}
                            onChange={e =>
                              void patchAnnual(row, {
                                preliminaryReport: e.target.checked,
                              })
                            }
                          />
                          완료
                        </span>
                        {row.annualSummary.preliminaryReport &&
                        row.annualSummary.preliminaryReportDate ? (
                          <span className="mt-0.5 block tabular-nums text-emerald-700">
                            {row.annualSummary.preliminaryReportDate}
                          </span>
                        ) : null}
                      </label>
                    </td>
                    <td className="px-1 py-1.5 text-center align-middle">
                      <label className="inline-flex cursor-pointer flex-col items-center justify-center gap-0 text-[10px] font-medium leading-tight text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300"
                            checked={!!row.annualSummary.report}
                            onChange={e =>
                              void patchAnnual(row, {
                                report: e.target.checked,
                              })
                            }
                          />
                          완료
                        </span>
                        {row.annualSummary.report && row.annualSummary.reportDate ? (
                          <span className="mt-0.5 block tabular-nums text-emerald-700">
                            {row.annualSummary.reportDate}
                          </span>
                        ) : null}
                      </label>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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
