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
import { SIMPLE_PAYROLL_GRID_COLUMNS, YEAR_END_COLUMNS } from '@/app/types/incomeTypes';
import type { IncomeTypeKey } from '@/app/types/incomeTypes';
import type { YearEndIncomeType } from '@/lib/yearEndFilingsDb';
import {
  employedSimplePayrollPeriodKey,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import { parseHometaxFile } from '@/app/utils/filingCheck';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { UNCategorized } from '@/app/utils/clientsGrouping';

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400';

export type IncomeFilingStats = { target: number; received: number; diff: number };

export type IncomeTypeFilingHandle = {
  reload: () => Promise<void>;
  uploadHometax: (file: File) => Promise<{ matched: number }>;
};

type Props = {
  mode: 'simplePayroll' | 'yearEnd';
  manager: string;
  year: number;
  month?: number;
  onYearChange?: (year: number) => void;
  onMonthChange?: (month: number) => void;
  embedded?: boolean;
  locked?: boolean;
  onStatsChange?: (stats: IncomeFilingStats) => void;
  onUploadNotice?: (text: string) => void;
  onEmployedFilingMonth?: (active: boolean) => void;
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

function computeStats(
  grid: ApiGridRow[],
  manager: string,
  mode: 'simplePayroll' | 'yearEnd',
): IncomeFilingStats {
  const rows = filterByManager(grid, manager);
  let target = 0;
  let received = 0;

  for (const row of rows) {
    if (row.excludeReason != null && row.excludeReason !== undefined) continue;
    const hasActive = Object.values(row.cells).some(c => c.active);
    if (!hasActive) continue;
    target += 1;
    if (isRowFullyFiled(row, mode)) received += 1;
  }

  return { target, received, diff: target - received };
}

const IncomeTypeFilingSection = forwardRef<IncomeTypeFilingHandle, Props>(function IncomeTypeFilingSection(
  {
    mode,
    manager,
    year,
    month: monthProp,
    onYearChange,
    onMonthChange,
    embedded,
    locked = false,
    onStatsChange,
    onUploadNotice,
    onEmployedFilingMonth,
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

  const filteredGrid = useMemo(() => filterByManager(grid, manager), [grid, manager]);

  const stats = useMemo(
    () => computeStats(grid, manager, mode),
    [grid, manager, mode],
  );

  useEffect(() => {
    onStatsChange?.(stats);
  }, [stats, onStatsChange]);

  const load = useCallback(async () => {
    if (embedded && !manager) return;
    setLoading(true);
    if (!embedded) setMessage('');
    try {
      const url =
        mode === 'simplePayroll'
          ? `/api/tax/simple-payroll?periodKey=${encodeURIComponent(periodKey)}&manager=${encodeURIComponent(manager)}`
          : `/api/tax/year-end?year=${year}&manager=${encodeURIComponent(manager)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('불러오기 실패');
      const data = await res.json();
      setGrid(data.grid ?? []);
      if (mode === 'simplePayroll') {
        const employedFilingMonth = data.employedFilingMonth ?? false;
        setSpMeta({
          monthlyPeriodKey: data.monthlyPeriodKey,
          employedPeriodKey: data.employedPeriodKey ?? null,
          employedFilingMonth,
        });
        onEmployedFilingMonth?.(employedFilingMonth);
      } else {
        onEmployedFilingMonth?.(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '불러오기 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [mode, periodKey, year, manager, embedded, onUploadNotice, onEmployedFilingMonth]);

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
            if (!cell?.active) continue;
            const pk = col.key === 'employed' && employedKey ? employedKey : monthlyKey;
            if (col.key === 'employed' && !employedKey) continue;
            rows.push({
              clientId: row.clientId,
              incomeType: col.key,
              periodKey: pk,
              filed: cell.filed,
              acceptanceDate: cell.acceptanceDate ?? '',
              acceptanceMethod: cell.acceptanceMethod ?? '',
            });
          }
          const labor = row.cells.laborContentReport;
          if (labor?.active) {
            const date = labor.acceptanceDate?.trim() ?? '';
            const method = labor.acceptanceMethod?.trim() ?? '';
            rows.push({
              clientId: row.clientId,
              incomeType: 'laborContentReport',
              periodKey: monthlyKey,
              filed: !!(date || method),
              acceptanceDate: date,
              acceptanceMethod: method,
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
        const rows: { clientId: string; incomeType: YearEndIncomeType; filed: boolean }[] = [];
        for (const row of grid) {
          for (const col of YEAR_END_COLUMNS) {
            const cell = row.cells[col.key];
            if (!cell?.active) continue;
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
      if (!embedded) setMessage('저장되었습니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패';
      if (embedded) onUploadNotice?.(msg);
      else setMessage(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [mode, grid, spMeta, year, month, embedded, onUploadNotice]);

  const scheduleSave = useCallback(() => {
    if (!embedded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistGrid().catch(() => {});
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
        const { bizNos } = await parseHometaxFile(file);
        const apiUrl = mode === 'simplePayroll' ? '/api/tax/simple-payroll' : '/api/tax/year-end';
        const body = mode === 'simplePayroll' ? { periodKey, bizNos } : { year, bizNos };
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error('매칭 실패');
        const matched = Number(data.matched ?? 0);
        const notice = `접수목록 ${matched}건을 사업자번호로 대조해 자동 체크했습니다.`;
        if (embedded) onUploadNotice?.(notice);
        else setMessage(notice);
        await load();
        return { matched };
      } catch (e) {
        const msg = e instanceof Error ? e.message : '엑셀 처리 실패';
        if (embedded) onUploadNotice?.(msg);
        else setMessage(msg);
        throw e;
      } finally {
        setParsing(false);
      }
    },
    [mode, periodKey, year, embedded, onUploadNotice, load],
  );

  useImperativeHandle(
    ref,
    () => ({
      reload: load,
      uploadHometax,
    }),
    [load, uploadHometax],
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
      await patchIncomeType(clientId, { [incomeType]: true });
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
      await patchIncomeType(clientId, { [incomeType]: false });
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

  const tableBlock = (
    <div className={`${portalCard} overflow-hidden`}>
      <IncomeTypeGridTable
        mode={mode}
        rows={filteredGrid}
        loading={loading}
        employedFilingMonth={spMeta?.employedFilingMonth ?? false}
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
        {tableBlock}
        {settingsClient && (
          <ClientFilingSettingsModal
            clientId={settingsClient.id}
            companyName={settingsClient.companyName}
            onClose={() => setSettingsClient(null)}
            onSaved={() => void load()}
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

      {tableBlock}

      {settingsClient && (
        <ClientFilingSettingsModal
          clientId={settingsClient.id}
          companyName={settingsClient.companyName}
          onClose={() => setSettingsClient(null)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
});

export default IncomeTypeFilingSection;
