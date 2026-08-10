'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
} from '@/app/components/portal/uiClasses';
import ClientFilingSettingsModal from '@/app/components/clients/ClientFilingSettingsModal';
import IncomeTypeGridTable, {
  type GridCellState,
  type IncomeGridRow,
} from '@/app/components/clients/IncomeTypeGridTable';
import {
  SIMPLE_PAYROLL_COLUMNS,
  SIMPLE_PAYROLL_GRID_COLUMNS,
  SIMPLE_PAYROLL_STAT_COLUMNS,
  YEAR_END_COLUMNS,
} from '@/app/types/incomeTypes';
import type { IncomeTypeKey, YearEndClientTypes, YearEndIncomeKey } from '@/app/types/incomeTypes';
import {
  employedSimplePayrollPeriodKey,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import { formatIncomeUploadNotice, parseHometaxFile, parseIncomeUploadResult, type IncomeUploadResult } from '@/app/utils/filingCheck';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { UNCategorized } from '@/app/utils/clientsGrouping';
import type { ClientRecord } from '@/app/types/client';
import {
  buildSimplePayrollGrid,
  buildYearEndGrid,
  patchSimplePayrollRowFromTypes,
  patchYearEndRowFromTypes,
  simplePayrollMonthNotes,
} from '@/lib/incomeTypeFilingGrid';
import type { ClientIncomeTypes } from '@/app/types/incomeTypes';

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400';

function isGridRowExcluded(row: IncomeGridRow): boolean {
  return row.excludeReason != null && row.excludeReason !== undefined;
}

/** 세션 진입 시 제외 업체를 맨 아래로 — 제외 토글 직후에는 순서 유지 */
function splitStableDisplayOrder<T>(
  items: T[],
  idOf: (item: T) => string,
  isExcluded: (item: T) => boolean,
): string[] {
  const active: string[] = [];
  const excluded: string[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (isExcluded(item)) excluded.push(id);
    else active.push(id);
  }
  return [...active, ...excluded];
}

function buildIncomeGridDisplayOrder(
  items: ApiGridRow[],
  withholdingOrderIds: string[],
): string[] {
  const ordered = withholdingOrderIds.length
    ? orderByDisplayIds(items, withholdingOrderIds, r => r.clientId)
    : items;
  return splitStableDisplayOrder(ordered, r => r.clientId, isGridRowExcluded);
}

function orderByDisplayIds<T>(items: T[], orderIds: string[], idOf: (item: T) => string): T[] {
  const map = new Map(items.map(item => [idOf(item), item]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of orderIds) {
    const item = map.get(id);
    if (item) {
      out.push(item);
      seen.add(id);
    }
  }
  for (const item of items) {
    const id = idOf(item);
    if (!seen.has(id)) out.push(item);
  }
  return out;
}

export type IncomeColumnStat = {
  key: string;
  label: string;
  target: number;
  received: number;
  diff: number;
};

export type UnreceivedByColumnStat = {
  key: string;
  label: string;
  names: string[];
};

export type IncomeFilingStats = {
  target: number;
  received: number;
  diff: number;
  excludedRows: number;
  byColumn: IncomeColumnStat[];
  /** 활성 칸 중 미접수인 업체 상호 (평탄) */
  unreceivedNames: string[];
  /** 항목별 미접수 — 「근로 ○○ 접수내역이 없습니다」 */
  unreceivedByColumn: UnreceivedByColumnStat[];
};

export type IncomeStatFilter = 'all' | 'target' | 'received' | 'diff';

export type IncomeTypeFilingHandle = {
  reload: () => Promise<void>;
  uploadHometax: (file: File) => Promise<IncomeUploadResult>;
  resetReceipt: () => Promise<void>;
};

type Props = {
  mode: 'simplePayroll' | 'yearEnd';
  manager: string;
  clients: ClientRecord[];
  year: number;
  month?: number;
  onYearChange?: (year: number) => void;
  onMonthChange?: (month: number) => void;
  embedded?: boolean;
  locked?: boolean;
  onStatsChange?: (stats: IncomeFilingStats) => void;
  onUploadNotice?: (text: string) => void;
  onEmployedFilingMonth?: (active: boolean) => void;
  onSaved?: () => void;
  rowFilter?: IncomeStatFilter;
  listScope?: 'targets' | 'all';
  /** 원천세 신고대상확인 목록 순서(담당자·월 기준) */
  withholdingOrderIds?: string[];
  /** 원천세 세션 특이사항 저장 */
  onSetRowNote?: (clientId: string, note: string) => void;
  /** 원천세 세션 제외 사유 저장 */
  onSetExcludeReason?: (clientId: string, reason: string) => void;
};

type ApiGridRow = IncomeGridRow & { manager?: string };

type SimplePayrollMeta = {
  monthlyPeriodKey: string;
  employedPeriodKey: string | null;
  employedFilingMonth: boolean;
};

async function patchIncomeType(clientId: string, patch: Record<string, boolean>) {
  const res = await fetch(`/api/clients/${clientId}/income-types`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incomeTypes: patch }),
  });
  if (!res.ok) throw new Error('소득유형 저장 실패');
}

async function patchYearEndType(clientId: string, patch: Partial<YearEndClientTypes>) {
  const res = await fetch(`/api/clients/${clientId}/income-types`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yearEndTypes: patch }),
  });
  if (!res.ok) throw new Error('연말 소득유형 저장 실패');
}

function filterByManager(grid: ApiGridRow[], manager: string): ApiGridRow[] {
  if (!manager || manager === '전체') return grid;
  const names = new Set(getManagerMatchNames(manager));
  names.add(manager);
  return grid.filter(r => names.has(r.manager?.trim() || UNCategorized));
}

function isRowFullyFiled(row: ApiGridRow, mode: 'simplePayroll' | 'yearEnd'): boolean {
  if (mode === 'simplePayroll') {
    for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
      if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
      const cell = row.cells[col.key];
      if (!cell?.active) continue;
      if (!cell.filed) return false;
    }
    const labor = row.cells.laborContentReport;
    if (labor?.active) {
      const done =
        labor.filed ||
        !!(labor.acceptanceDate?.trim() || labor.acceptanceMethod?.trim());
      if (!done) return false;
    }
    return true;
  }
  for (const col of YEAR_END_COLUMNS) {
    const cell = row.cells[col.key];
    if (!cell?.active) continue;
    if (!cell.filed) return false;
  }
  return true;
}

function matchesRowFilter(
  row: ApiGridRow,
  mode: 'simplePayroll' | 'yearEnd',
  filter: IncomeStatFilter,
): boolean {
  if (filter === 'all') return true;
  const hasActive = Object.values(row.cells).some(c => c.active);
  const excluded = isGridRowExcluded(row);
  if (filter === 'target') return hasActive;
  if (excluded && !hasActive) return false;
  const fullyFiled = isRowFullyFiled(row, mode);
  if (filter === 'received') return hasActive && fullyFiled;
  if (filter === 'diff') return hasActive && !fullyFiled;
  return true;
}

function isCellReceived(
  cell: GridCellState | undefined,
  key: string,
): boolean {
  if (!cell?.active) return false;
  if (key === 'laborContentReport') {
    return (
      cell.filed ||
      !!(cell.acceptanceDate?.trim() || cell.acceptanceMethod?.trim())
    );
  }
  return cell.filed;
}

function columnDefs(mode: 'simplePayroll' | 'yearEnd') {
  if (mode === 'simplePayroll') {
    return SIMPLE_PAYROLL_STAT_COLUMNS.map(c => ({ key: c.key, label: c.label }));
  }
  return YEAR_END_COLUMNS.map(c => ({ key: c.key, label: c.label }));
}

function noticeColumnDefs(mode: 'simplePayroll' | 'yearEnd') {
  if (mode === 'simplePayroll') {
    return SIMPLE_PAYROLL_COLUMNS.map(c => ({ key: c.key, label: c.label }));
  }
  return YEAR_END_COLUMNS.map(c => ({ key: c.key, label: c.label }));
}

function computeStats(
  grid: ApiGridRow[],
  manager: string,
  mode: 'simplePayroll' | 'yearEnd',
): IncomeFilingStats {
  const rows = filterByManager(grid, manager);

  const byColumn: IncomeColumnStat[] = columnDefs(mode).map(({ key, label }) => {
    let colTarget = 0;
    let colReceived = 0;
    for (const row of rows) {
      const cell = row.cells[key];
      if (!cell?.active) continue;
      colTarget += 1;
      if (isCellReceived(cell, key)) colReceived += 1;
    }
    return { key, label, target: colTarget, received: colReceived, diff: colTarget - colReceived };
  });

  // 열 헤더(근로·일용·사업…)와 동일하게 체크 칸 단위로 합산 — 업체 수(곳)와 혼동 방지
  let target = 0;
  let received = 0;
  for (const col of byColumn) {
    target += col.target;
    received += col.received;
  }

  const excludedRows = rows.filter(r => isGridRowExcluded(r)).length;

  const unreceivedByColumn: UnreceivedByColumnStat[] = [];
  const unreceivedNames: string[] = [];
  const seenName = new Set<string>();

  for (const { key, label } of noticeColumnDefs(mode)) {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      // 원천세 제외여도 활성 칸이면 미접수 안내에 포함
      const cell = row.cells[key];
      if (!cell?.active) continue;
      if (isCellReceived(cell, key)) continue;
      const name = row.companyName?.trim() || '(이름없음)';
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
      if (!seenName.has(name)) {
        seenName.add(name);
        unreceivedNames.push(name);
      }
    }
    if (names.length > 0) unreceivedByColumn.push({ key, label, names });
  }

  return {
    target,
    received,
    diff: target - received,
    excludedRows,
    byColumn,
    unreceivedNames,
    unreceivedByColumn,
  };
}

const IncomeTypeFilingSection = forwardRef<IncomeTypeFilingHandle, Props>(function IncomeTypeFilingSection(
  {
    mode,
    manager,
    clients,
    year,
    month: monthProp,
    onYearChange,
    onMonthChange,
    embedded,
    locked = false,
    onStatsChange,
    onUploadNotice,
    onEmployedFilingMonth,
    onSaved,
    rowFilter = 'all',
    listScope = 'all',
    withholdingOrderIds = [],
    onSetRowNote,
    onSetExcludeReason,
  },
  ref,
) {
  const now = new Date();
  const [month, setMonth] = useState(monthProp ?? now.getMonth() + 1);
  const [grid, setGrid] = useState<ApiGridRow[]>([]);
  const [spMeta, setSpMeta] = useState<SimplePayrollMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState('');
  const [displayOrderEpoch, setDisplayOrderEpoch] = useState(0);
  const [rowDisplayOrder, setRowDisplayOrder] = useState<string[]>([]);
  const displayOrderEpochAppliedRef = useRef(-1);
  const [settingsClient, setSettingsClient] = useState<{ id: string; companyName: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const saveInFlightRef = useRef(false);
  const saveAgainRef = useRef(false);

  const periodKey =
    mode === 'simplePayroll' ? simplePayrollMonthlyPeriodKey(year, month) : String(year);

  const columnLabels = useMemo(() => {
    if (mode === 'simplePayroll') {
      return Object.fromEntries(
        SIMPLE_PAYROLL_GRID_COLUMNS.filter(c => c.kind === 'filed').map(c =>
          c.kind === 'filed' ? [c.key, c.label] : [],
        ),
      ) as Record<string, string>;
    }
    return Object.fromEntries(YEAR_END_COLUMNS.map(c => [c.key, c.label]));
  }, [mode]);

  const orderedGrid = useMemo(
    () => orderByDisplayIds(grid, rowDisplayOrder, r => r.clientId),
    [grid, rowDisplayOrder],
  );

  const filteredGrid = useMemo(() => {
    const byManager = filterByManager(orderedGrid, manager);
    const scoped =
      listScope === 'targets' ? byManager.filter(row => !isGridRowExcluded(row)) : byManager;
    if (rowFilter === 'all') return scoped;
    return scoped.filter(row => matchesRowFilter(row, mode, rowFilter));
  }, [orderedGrid, manager, mode, rowFilter, listScope]);

  // 세션(기간·담당자) 진입 시 원천세 순서 적용 + 제외 업체 하단 — 제외 토글 직후에는 순서 유지
  useEffect(() => {
    if (displayOrderEpochAppliedRef.current !== displayOrderEpoch) {
      displayOrderEpochAppliedRef.current = displayOrderEpoch;
      setRowDisplayOrder(buildIncomeGridDisplayOrder(grid, withholdingOrderIds));
      return;
    }

    setRowDisplayOrder(prev => {
      const known = new Set(prev);
      const extra = grid.map(r => r.clientId).filter(id => !known.has(id));
      if (!extra.length) return prev;
      if (prev.length === 0 && grid.length > 0) {
        return buildIncomeGridDisplayOrder(grid, withholdingOrderIds);
      }
      return [...prev, ...extra];
    });
  }, [displayOrderEpoch, grid, withholdingOrderIds]);

  const stats = useMemo(
    () => computeStats(grid, manager, mode),
    [grid, manager, mode],
  );

  useEffect(() => {
    onStatsChange?.(stats);
  }, [stats, onStatsChange]);

  const refreshClientIncomeTypes = useCallback(
    async (clientId: string) => {
      const res = await fetch(`/api/clients/${clientId}/income-types`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        incomeTypes?: ClientIncomeTypes;
        yearEndTypes?: YearEndClientTypes;
        withholdingSettings?: { semiAnnualTarget?: boolean; semiAnnualMonthlyDisplay?: boolean };
      };
      if (mode === 'simplePayroll') {
        if (!data.incomeTypes) return;
        const intakePatch = {
          withholdingSettings: data.withholdingSettings ?? {},
        };
        setGrid(prev =>
          prev.map(row => {
            if (row.clientId !== clientId) return row;
            return patchSimplePayrollRowFromTypes(
              row,
              data.incomeTypes!,
              month,
              intakePatch,
            );
          }),
        );
      } else {
        if (!data.incomeTypes || !data.yearEndTypes) return;
        setGrid(prev =>
          prev.map(row => {
            if (row.clientId !== clientId) return row;
            // 이미 활성인 공유 열(근로·사업·기타)은 간이지급 이력으로 켠 것으로 보고 유지
            const keepSimple = new Set<string>();
            for (const key of ['employed', 'bizIncome', 'otherTax'] as const) {
              if (row.cells[key]?.active) keepSimple.add(key);
            }
            return patchYearEndRowFromTypes(
              row,
              data.incomeTypes!,
              data.yearEndTypes!,
              keepSimple,
            );
          }),
        );
      }
    },
    [mode, month],
  );

  const load = useCallback(async () => {
    if (embedded && !manager) {
      setLoading(true);
      return;
    }
    setLoading(true);
    if (!embedded) setMessage('');

    const applySimplePayroll = (built: ReturnType<typeof buildSimplePayrollGrid>) => {
      setGrid(built.grid);
      setSpMeta({
        monthlyPeriodKey: built.meta.monthlyPeriodKey,
        employedPeriodKey: built.meta.employedPeriodKey,
        employedFilingMonth: built.meta.employedFilingMonth,
      });
      onEmployedFilingMonth?.(built.meta.employedFilingMonth);
    };

    try {
      if (mode === 'simplePayroll') {
        applySimplePayroll(buildSimplePayrollGrid(clients, periodKey, [], {}));
      } else {
        setGrid(buildYearEndGrid(clients, year, [], {}));
        onEmployedFilingMonth?.(false);
      }

      const url =
        mode === 'simplePayroll'
          ? `/api/tax/simple-payroll?periodKey=${encodeURIComponent(periodKey)}&manager=${encodeURIComponent(manager)}`
          : `/api/tax/year-end?year=${year}&manager=${encodeURIComponent(manager)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.grid)) {
          setGrid(data.grid);
        }
        if (mode === 'simplePayroll' && data.monthlyPeriodKey) {
          setSpMeta({
            monthlyPeriodKey: data.monthlyPeriodKey,
            employedPeriodKey: data.employedPeriodKey ?? null,
            employedFilingMonth: data.employedFilingMonth ?? false,
          });
          onEmployedFilingMonth?.(data.employedFilingMonth ?? false);
        }
      } else if (clients.length === 0) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err.error === 'string' ? err.error : '불러오기 실패';
        if (embedded) onUploadNotice?.(msg);
        else setMessage(msg);
      }
    } catch (e) {
      if (clients.length === 0) {
        const msg = e instanceof Error ? e.message : '불러오기 실패';
        if (embedded) onUploadNotice?.(msg);
        else setMessage(msg);
      }
    } finally {
      setLoading(false);
      setDisplayOrderEpoch(e => e + 1);
    }
  }, [
    mode,
    periodKey,
    year,
    manager,
    clients,
    embedded,
    onUploadNotice,
    onEmployedFilingMonth,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (withholdingOrderIds.length === 0) return;
    setDisplayOrderEpoch(e => e + 1);
  }, [withholdingOrderIds]);

  useEffect(() => {
    if (monthProp) setMonth(monthProp);
  }, [monthProp]);

  const persistGrid = useCallback(async () => {
    if (saveInFlightRef.current) {
      saveAgainRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    saveAgainRef.current = false;
    setSaving(true);
    if (!embedded) setMessage('');
    try {
      // setState 직후 클로저가 한 박자 늦을 수 있어 ref 기준으로 저장
      const snapshot = gridRef.current;
      if (mode === 'simplePayroll') {
        const monthlyKey = spMeta?.monthlyPeriodKey ?? simplePayrollMonthlyPeriodKey(year, month);
        const employedKey =
          spMeta?.employedPeriodKey ?? employedSimplePayrollPeriodKey(year, month);
        const rows: {
          clientId: string;
          incomeType: IncomeTypeKey;
          periodKey: string;
          filed: boolean;
          acceptanceDate: string;
          acceptanceMethod: string;
          notes: string;
        }[] = [];

        for (const row of snapshot) {
          for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
            if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
            const cell = row.cells[col.key];
            if (!cell) continue;
            const pk = col.key === 'employed' && employedKey ? employedKey : monthlyKey;
            if (col.key === 'employed' && !employedKey) continue;
            // 접수(filed)·일자·방법은 유지. 월 비활성은 명시적으로 끈 경우만 notes 기록.
            rows.push({
              clientId: row.clientId,
              incomeType: col.key,
              periodKey: pk,
              filed: cell.filed,
              acceptanceDate: cell.acceptanceDate ?? '',
              acceptanceMethod: cell.acceptanceMethod ?? '',
              notes: simplePayrollMonthNotes({
                monthInactive: cell.monthInactive,
                monthForcedActive: cell.monthForcedActive,
              }),
            });
          }
          const labor = row.cells.laborContentReport;
          if (labor) {
            const date = labor.acceptanceDate?.trim() ?? '';
            const method = labor.acceptanceMethod?.trim() ?? '';
            rows.push({
              clientId: row.clientId,
              incomeType: 'laborContentReport',
              periodKey: monthlyKey,
              filed: !!(date || method) || labor.filed,
              acceptanceDate: date,
              acceptanceMethod: method,
              notes: simplePayrollMonthNotes({
                monthInactive: labor.monthInactive,
                monthForcedActive: labor.monthForcedActive,
              }),
            });
          }
        }

        const res = await fetch('/api/tax/simple-payroll', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month, rows }),
        });
        if (!res.ok) throw new Error('저장 실패');
      } else {
        const rows: { clientId: string; incomeType: YearEndIncomeKey; filed: boolean }[] = [];
        for (const row of snapshot) {
          for (const col of YEAR_END_COLUMNS) {
            const cell = row.cells[col.key];
            if (!cell) continue;
            // 비활성 칸이어도 접수 체크는 유지 (간이지급 월별 off ≠ 연말 접수 삭제)
            rows.push({
              clientId: row.clientId,
              incomeType: col.key,
              filed: cell.filed,
            });
          }
        }
        const res = await fetch('/api/tax/year-end', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, rows }),
        });
        if (!res.ok) throw new Error('저장 실패');
      }
      if (embedded) onSaved?.();
      if (!embedded) setMessage('저장되었습니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
      throw e;
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        void persistGrid().catch(() => {
          onUploadNotice?.('저장 실패 — 서버 연결을 확인해 주세요.');
        });
      }
    }
  }, [mode, spMeta, year, month, embedded, onUploadNotice, onSaved]);

  const scheduleSave = useCallback(() => {
    if (!embedded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistGrid().catch(() => {
        onUploadNotice?.('저장 실패 — 서버 연결을 확인해 주세요.');
      });
    }, 400);
  }, [embedded, persistGrid, onUploadNotice]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const uploadHometax = useCallback(
    async (file: File) => {
      setParsing(true);
      if (!embedded) setMessage('');
      try {
        const { bizNos, filings } = await parseHometaxFile(file);
        const apiUrl = mode === 'simplePayroll' ? '/api/tax/simple-payroll' : '/api/tax/year-end';
        const body =
          mode === 'simplePayroll'
            ? { periodKey, filings, bizNos, manager }
            : { year, filings, bizNos, manager };
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? '매칭 실패');
        const result = parseIncomeUploadResult(data as Record<string, unknown>);
        const taxLabel = mode === 'simplePayroll' ? '간이지급' : '연말정산';
        const notice = formatIncomeUploadNotice(result, taxLabel);
        if (embedded) onUploadNotice?.(notice);
        else setMessage(notice);
        await load();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '엑셀 처리 실패';
        if (embedded) onUploadNotice?.(msg);
        else setMessage(msg);
        throw e;
      } finally {
        setParsing(false);
      }
    },
    [mode, periodKey, year, manager, embedded, onUploadNotice, load],
  );

  const resetReceipt = useCallback(async () => {
    const url =
      mode === 'simplePayroll'
        ? `/api/tax/simple-payroll?periodKey=${encodeURIComponent(periodKey)}`
        : `/api/tax/year-end?year=${year}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error('접수 초기화 실패');
    if (!embedded) setMessage('접수(체크)만 초기화했습니다.');
    await load();
  }, [mode, periodKey, year, embedded, load]);

  useImperativeHandle(
    ref,
    () => ({
      reload: load,
      uploadHometax,
      resetReceipt,
    }),
    [load, uploadHometax, resetReceipt],
  );

  const updateCell = (clientId: string, incomeType: string, patch: Partial<GridCellState>) => {
    setGrid(prev => {
      const next = prev.map(row => {
        if (row.clientId !== clientId) return row;
        return {
          ...row,
          cells: {
            ...row.cells,
            [incomeType]: { ...row.cells[incomeType], ...patch },
          },
        };
      });
      gridRef.current = next;
      return next;
    });
  };

  const labelOf = (incomeType: string) =>
    columnLabels[incomeType] ??
    (incomeType === 'laborContentReport' ? '근로내용확인신고' : incomeType);

  const YEAR_END_SHARED = new Set<string>(['employed', 'bizIncome', 'otherTax']);

  const handleActivate = async (clientId: string, incomeType: string) => {
    if (locked) return;
    try {
      if (mode === 'yearEnd') {
        if (YEAR_END_SHARED.has(incomeType)) {
          // 근로·사업·기타는 간이지급 incomeTypes와 공유
          await patchIncomeType(clientId, { [incomeType]: true });
        } else {
          await patchYearEndType(clientId, { [incomeType as YearEndIncomeKey]: true });
        }
        updateCell(clientId, incomeType, {
          active: true,
          monthInactive: false,
          monthForcedActive: true,
        });
      } else {
        await patchIncomeType(clientId, { [incomeType]: true });
        // 수동 활성 → 전월 미신고여도 차이(미접수) 대상. 접수자료는 유지.
        updateCell(clientId, incomeType, {
          active: true,
          monthInactive: false,
          monthForcedActive: true,
        });
      }
      if (!embedded) setMessage(`${labelOf(incomeType)} 활성화`);
      scheduleSave();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '활성화 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
    }
  };

  const handleDeactivate = async (clientId: string, incomeType: string) => {
    if (locked) return;
    try {
      if (mode === 'yearEnd') {
        if (YEAR_END_SHARED.has(incomeType)) {
          // 근로·사업·기타 월별 on/off는 간이지급에서만. 연말에서는 설정을 지우지 않음.
          if (!embedded) {
            setMessage(
              `${labelOf(incomeType)} 월별 활성/비활성은 간이지급에서 하세요. 같은 해 간이지급 접수가 있으면 설정이 꺼져 있어도 연말정산에 표시됩니다.`,
            );
          }
          return;
        }
        await patchYearEndType(clientId, { [incomeType as YearEndIncomeKey]: false });
        updateCell(clientId, incomeType, { active: false });
      } else {
        await patchIncomeType(clientId, { [incomeType]: false });
        // 접수 완료 자료는 유지 — 비활성 이월(다음달도 전월 미신고로 비활성)
        updateCell(clientId, incomeType, {
          active: false,
          monthInactive: true,
          monthForcedActive: false,
        });
      }
      if (!embedded) setMessage(`${labelOf(incomeType)} 비활성화`);
      scheduleSave();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '비활성화 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
    }
  };

  const handleToggleFiled = (clientId: string, incomeType: string, filed: boolean) => {
    if (locked) return;
    updateCell(clientId, incomeType, { filed });
    scheduleSave();
  };

  const handlePatchLabor = (
    clientId: string,
    patch: Partial<{ acceptanceDate: string; acceptanceMethod: string }>,
  ) => {
    if (locked) return;
    updateCell(clientId, 'laborContentReport', patch);
    scheduleSave();
  };

  const handleToggleExclude = async (clientId: string) => {
    if (locked) return;
    try {
      const body =
        mode === 'yearEnd'
          ? { manager, year, clientId, scope: 'year' as const }
          : { manager, periodKey, clientId, scope: 'month' as const };
      const res = await fetch('/api/filing-check/toggle-exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('제외 상태 변경 실패');
      const data = (await res.json()) as { excluded: boolean };
      setGrid(prev =>
        prev.map(row => {
          if (row.clientId !== clientId) return row;
          return {
            ...row,
            excludeReason: data.excluded ? (row.excludeReason ?? '') : null,
          };
        }),
      );
      if (!embedded) {
        setMessage(data.excluded ? '원천세 제외 처리했습니다.' : '원천세 제외를 해제했습니다.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '제외 토글 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
    }
  };

  const handleSetRowNote = (clientId: string, note: string) => {
    setGrid(prev =>
      prev.map(row => (row.clientId === clientId ? { ...row, rowNote: note } : row)),
    );
    onSetRowNote?.(clientId, note);
  };

  const handleSetExcludeReason = (clientId: string, reason: string) => {
    setGrid(prev =>
      prev.map(row => (row.clientId === clientId ? { ...row, excludeReason: reason } : row)),
    );
    onSetExcludeReason?.(clientId, reason);
  };

  const years = Array.from({ length: 10 }, (_, i) => 2025 + i);

  const filterBanner =
    rowFilter !== 'all' ? (
      <p className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        {rowFilter === 'target' && '신고대상 업체만 표시 중'}
        {rowFilter === 'received' && '접수완료 업체만 표시 중'}
        {rowFilter === 'diff' && '미완료(차이) 업체만 표시 중'}
        {' · '}
        <span className="text-blue-600">통계 카드를 다시 클릭하면 전체 보기</span>
      </p>
    ) : null;

  const tableBlock = (
    <div className={portalCard}>
      <IncomeTypeGridTable
        mode={mode}
        rows={filteredGrid}
        loading={loading}
        locked={locked}
        employedFilingMonth={spMeta?.employedFilingMonth ?? false}
        columnStats={stats.byColumn}
        onOpenSettings={(id, name) => setSettingsClient({ id, companyName: name })}
        onToggleExclude={id => void handleToggleExclude(id)}
        onActivate={(id, key) => void handleActivate(id, key)}
        onDeactivate={(id, key) => void handleDeactivate(id, key)}
        onToggleFiled={handleToggleFiled}
        onPatchLabor={mode === 'simplePayroll' ? handlePatchLabor : undefined}
        onSetRowNote={onSetRowNote ? handleSetRowNote : undefined}
        onSetExcludeReason={onSetExcludeReason ? handleSetExcludeReason : undefined}
      />
    </div>
  );

  if (embedded) {
    return (
      <>
        {filterBanner}
        {tableBlock}
        {settingsClient && (
          <ClientFilingSettingsModal
            clientId={settingsClient.id}
            companyName={settingsClient.companyName}
            canEdit={!locked}
            onClose={() => setSettingsClient(null)}
            onSaved={() => void refreshClientIncomeTypes(settingsClient.id)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className={`${portalCard} mb-4 flex flex-wrap items-center gap-3 p-4`}>
        <select
          value={year}
          onChange={e => onYearChange?.(Number(e.target.value))}
          className={inputCls}
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}년{mode === 'yearEnd' ? ' 귀속' : ''}
            </option>
          ))}
        </select>
        {mode === 'simplePayroll' && (
          <select
            value={month}
            onChange={e => {
              const m = Number(e.target.value);
              setMonth(m);
              onMonthChange?.(m);
            }}
            className={inputCls}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        )}
        {mode === 'simplePayroll' && spMeta?.employedFilingMonth && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            근로 반기 신고월 (6·12월)
          </span>
        )}
        <button type="button" className={portalBtnSecondary} onClick={() => void load()}>
          새로고침
        </button>
        <input
          id="income-type-hometax-upload"
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          disabled={parsing}
          onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            void uploadHometax(f).catch(() => {});
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        <label
          htmlFor="income-type-hometax-upload"
          className={`${portalBtnSecondary} ${
            parsing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          aria-disabled={parsing}
          title={parsing ? '파일을 읽는 중입니다.' : '홈택스 접수목록 엑셀(.xlsx/.xls) 선택'}
        >
          {parsing ? '읽는 중…' : '홈택스 접수목록 업로드'}
        </label>
        <button
          type="button"
          className={portalBtnPrimary}
          disabled={saving}
          onClick={() => void persistGrid()}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      {message && (
        <p className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {message}
        </p>
      )}

      {filterBanner}

      {tableBlock}

      {settingsClient && (
        <ClientFilingSettingsModal
          clientId={settingsClient.id}
          companyName={settingsClient.companyName}
          onClose={() => setSettingsClient(null)}
          onSaved={() => void refreshClientIncomeTypes(settingsClient.id)}
        />
      )}
    </>
  );
});

export default IncomeTypeFilingSection;
