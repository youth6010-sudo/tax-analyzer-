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
import { SIMPLE_PAYROLL_COLUMNS, SIMPLE_PAYROLL_GRID_COLUMNS, YEAR_END_COLUMNS } from '@/app/types/incomeTypes';
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
} from '@/lib/incomeTypeFilingGrid';
import type { ClientIncomeTypes } from '@/app/types/incomeTypes';

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400';

export type IncomeColumnStat = {
  key: string;
  label: string;
  target: number;
  received: number;
  diff: number;
};

export type IncomeFilingStats = {
  target: number;
  received: number;
  diff: number;
  byColumn: IncomeColumnStat[];
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
  if (row.excludeReason != null && row.excludeReason !== undefined) return false;
  const hasActive = Object.values(row.cells).some(c => c.active);
  if (filter === 'target') return hasActive;
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
      if (row.excludeReason != null && row.excludeReason !== undefined) continue;
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

  return { target, received, diff: target - received, byColumn };
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
  const [settingsClient, setSettingsClient] = useState<{ id: string; companyName: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const filteredGrid = useMemo(() => {
    const byManager = filterByManager(grid, manager);
    if (rowFilter === 'all') return byManager;
    return byManager.filter(row => matchesRowFilter(row, mode, rowFilter));
  }, [grid, manager, mode, rowFilter]);

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
      };
      if (mode === 'simplePayroll') {
        if (!data.incomeTypes) return;
        setGrid(prev =>
          prev.map(row => {
            if (row.clientId !== clientId) return row;
            return patchSimplePayrollRowFromTypes(
              row,
              data.incomeTypes!,
              spMeta?.employedFilingMonth ?? false,
            );
          }),
        );
      } else {
        if (!data.yearEndTypes) return;
        setGrid(prev =>
          prev.map(row => {
            if (row.clientId !== clientId) return row;
            return patchYearEndRowFromTypes(row, data.yearEndTypes!);
          }),
        );
      }
    },
    [mode, spMeta?.employedFilingMonth],
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
    if (monthProp) setMonth(monthProp);
  }, [monthProp]);

  const persistGrid = useCallback(async () => {
    setSaving(true);
    if (!embedded) setMessage('');
    try {
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
        }[] = [];

        for (const row of grid) {
          for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
            if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
            const cell = row.cells[col.key];
            if (!cell) continue;
            const pk = col.key === 'employed' && employedKey ? employedKey : monthlyKey;
            if (col.key === 'employed' && !employedKey) continue;
            rows.push({
              clientId: row.clientId,
              incomeType: col.key,
              periodKey: pk,
              filed: cell.active ? cell.filed : false,
              acceptanceDate: cell.active ? (cell.acceptanceDate ?? '') : '',
              acceptanceMethod: cell.active ? (cell.acceptanceMethod ?? '') : '',
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
              filed: labor.active ? !!(date || method) : false,
              acceptanceDate: labor.active ? date : '',
              acceptanceMethod: labor.active ? method : '',
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
        for (const row of grid) {
          for (const col of YEAR_END_COLUMNS) {
            const cell = row.cells[col.key];
            if (!cell) continue;
            rows.push({
              clientId: row.clientId,
              incomeType: col.key,
              filed: cell.active ? cell.filed : false,
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
    }
  }, [mode, grid, spMeta, year, month, embedded, onUploadNotice, onSaved]);

  const scheduleSave = useCallback(() => {
    if (!embedded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistGrid().catch(() => {
        onUploadNotice?.('저장 실패 — 서버 연결을 확인해 주세요.');
      });
    }, 400);
  }, [embedded, persistGrid]);

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
    setGrid(prev =>
      prev.map(row => {
        if (row.clientId !== clientId) return row;
        return {
          ...row,
          cells: {
            ...row.cells,
            [incomeType]: { ...row.cells[incomeType], ...patch },
          },
        };
      }),
    );
  };

  const labelOf = (incomeType: string) =>
    columnLabels[incomeType] ??
    (incomeType === 'laborContentReport' ? '근로내용확인신고' : incomeType);

  const handleActivate = async (clientId: string, incomeType: string) => {
    if (locked) return;
    try {
      if (mode === 'yearEnd') {
        await patchYearEndType(clientId, { [incomeType as YearEndIncomeKey]: true });
      } else {
        await patchIncomeType(clientId, { [incomeType]: true });
      }
      updateCell(clientId, incomeType, { active: true, filed: false });
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
        await patchYearEndType(clientId, { [incomeType as YearEndIncomeKey]: false });
      } else {
        await patchIncomeType(clientId, { [incomeType]: false });
      }
      updateCell(clientId, incomeType, {
        active: false,
        filed: false,
        acceptanceDate: '',
        acceptanceMethod: '',
      });
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
            excludeReason: data.excluded ? row.excludeReason ?? '' : null,
          };
        }),
      );
      if (!embedded) {
        setMessage(data.excluded ? '원천세 제외 처리했습니다.' : '원천세 제외를 해제했습니다.');
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '제외 토글 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
    }
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
    <div className={`${portalCard} overflow-hidden`}>
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
            근로 반기 신고월
          </span>
        )}
        <button type="button" className={portalBtnSecondary} onClick={() => void load()}>
          새로고침
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            void uploadHometax(f).catch(() => {});
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        <button
          type="button"
          className={portalBtnSecondary}
          disabled={parsing}
          onClick={() => fileRef.current?.click()}
        >
          {parsing ? '읽는 중…' : '홈택스 접수목록 업로드'}
        </button>
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
