'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { SIMPLE_PAYROLL_GRID_COLUMNS, YEAR_END_COLUMNS } from '@/app/types/incomeTypes';

export type GridCellState = {
  active: boolean;
  applicable?: boolean;
  filed: boolean;
  acceptanceDate?: string;
  acceptanceMethod?: string;
};

export type IncomeGridRow = {
  clientId: string;
  companyName: string;
  representative: string;
  businessNo: string;
  douzoneCode?: string;
  excludeReason?: string | null;
  rowNote?: string;
  cells: Record<string, GridCellState>;
};

type YearEndColumn = { key: string; label: string };

export type IncomeColumnStat = {
  key: string;
  label: string;
  target: number;
  received: number;
  diff: number;
};

type Props = {
  mode: 'simplePayroll' | 'yearEnd';
  rows: IncomeGridRow[];
  loading?: boolean;
  employedFilingMonth?: boolean;
  inputCls?: string;
  columnStats?: IncomeColumnStat[];
  onOpenSettings: (clientId: string, companyName: string) => void;
  onToggleExclude: (clientId: string) => void;
  onActivate: (clientId: string, incomeType: string) => void;
  onDeactivate: (clientId: string, incomeType: string) => void;
  onToggleFiled: (clientId: string, incomeType: string, filed: boolean) => void;
  onPatchLabor?: (
    clientId: string,
    patch: Partial<{ acceptanceDate: string; acceptanceMethod: string }>,
  ) => void;
  onSetRowNote?: (clientId: string, note: string) => void;
  onSetExcludeReason?: (clientId: string, reason: string) => void;
  locked?: boolean;
};

const COL_WIDTH = {
  no: 48,
  code: 80,
  company: 256,
  biz: 128,
  income: 52,
  labor: 88,
  noteMin: 120,
} as const;

function colStyle(px: number) {
  return { width: px, minWidth: px, maxWidth: px };
}

function noteColStyle() {
  return { minWidth: COL_WIDTH.noteMin };
}

const defaultInputCls =
  'rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400';

function isExcluded(row: IncomeGridRow): boolean {
  return row.excludeReason !== null && row.excludeReason !== undefined;
}

function renderInactiveCell(
  row: IncomeGridRow,
  colKey: string,
  onActivate: Props['onActivate'],
  label: string,
  excluded: boolean,
  locked: boolean,
  activateKey?: string,
  className?: string,
) {
  const incomeType = activateKey ?? colKey;
  const tdCls = `px-1 py-2 text-center ${className ?? ''}`;
  if (excluded || locked) {
    return (
      <td key={colKey} className={`${tdCls} text-slate-200`}>
        —
      </td>
    );
  }
  return (
    <td key={colKey} className={tdCls}>
      <button
        type="button"
        onClick={() => onActivate(row.clientId, incomeType)}
        className="w-full rounded-lg py-2 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-500"
        title={`클릭하여 ${label} 활성화`}
      >
        —
      </button>
    </td>
  );
}

function renderExcludeBadgeCell(colKey: string, className?: string) {
  return (
    <td key={colKey} className={`px-1 py-2 text-center ${className ?? ''}`}>
      <div className="flex min-h-9 items-center justify-center">
        <span className="whitespace-nowrap rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          원천세 제외
        </span>
      </div>
    </td>
  );
}

function renderNaCell(colKey: string, excluded: boolean, showExcludeBadge: boolean) {
  if (excluded && showExcludeBadge) {
    return renderExcludeBadgeCell(colKey);
  }
  return (
    <td key={colKey} className="px-2 py-2 text-center text-[11px] text-slate-300">
      해당없음
    </td>
  );
}

export default function IncomeTypeGridTable({
  mode,
  rows,
  loading,
  employedFilingMonth = true,
  inputCls = defaultInputCls,
  columnStats,
  onOpenSettings,
  onToggleExclude,
  onActivate,
  onDeactivate,
  onToggleFiled,
  onPatchLabor,
  onSetRowNote,
  onSetExcludeReason,
  locked = false,
}: Props) {
  const simpleCols = SIMPLE_PAYROLL_GRID_COLUMNS;
  const yearEndCols = YEAR_END_COLUMNS as readonly YearEndColumn[];
  const statMap = useMemo(() => {
    const m = new Map<string, IncomeColumnStat>();
    for (const s of columnStats ?? []) m.set(s.key, s);
    return m;
  }, [columnStats]);

  const renderColCount = (key: string) => {
    const s = statMap.get(key);
    if (!s || s.target <= 0) return null;
    return (
      <div className="mt-0.5 text-[10px] font-normal tabular-nums text-emerald-600">
        {s.received}/{s.target}
      </div>
    );
  };

  const simpleHeader = () => {
    const row1: ReactNode[] = [];
    const row2: ReactNode[] = [];
    let laborGroupStarted = false;

    for (const col of simpleCols) {
      if (col.kind === 'filed') {
        row1.push(
          <th key={col.key} rowSpan={2} className="px-1 py-2 text-center font-semibold">
            {col.label}
            {renderColCount(col.key)}
          </th>,
        );
      } else if (col.kind === 'laborDate') {
        row1.push(
          <th
            key="labor-group"
            colSpan={2}
            className="border-l border-slate-200 px-1 py-1 text-center font-semibold text-violet-700"
          >
            근로내용확인신고
            {renderColCount('laborContentReport')}
          </th>,
        );
        row2.push(
          <th
            key="laborDate"
            className="border-l border-slate-100 px-1 py-1 text-center font-medium text-violet-600"
          >
            {col.label}
          </th>,
        );
        laborGroupStarted = true;
      } else if (col.kind === 'laborMethod' && laborGroupStarted) {
        row2.push(
          <th key="laborMethod" className="px-1 py-1 text-center font-medium text-violet-600">
            {col.label}
          </th>,
        );
      }
    }

    return (
      <>
        <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
          <th rowSpan={2} style={colStyle(COL_WIDTH.no)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
            순번
          </th>
          <th rowSpan={2} style={colStyle(COL_WIDTH.code)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
            코드
          </th>
          <th rowSpan={2} style={colStyle(COL_WIDTH.company)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
            업체명
          </th>
          <th rowSpan={2} style={colStyle(COL_WIDTH.biz)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
            사업자번호
          </th>
          {row1}
          <th rowSpan={2} style={noteColStyle()} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
            특이사항
          </th>
        </tr>
        <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500">{row2}</tr>
      </>
    );
  };

  const incomeColCount = mode === 'simplePayroll' ? simpleCols.length : yearEndCols.length;
  const colSpan = 5 + incomeColCount;

  const simpleColGroup = () => (
    <colgroup>
      <col style={colStyle(COL_WIDTH.no)} />
      <col style={colStyle(COL_WIDTH.code)} />
      <col style={colStyle(COL_WIDTH.company)} />
      <col style={colStyle(COL_WIDTH.biz)} />
      {simpleCols.map(col => (
        <col
          key={col.kind === 'filed' ? col.key : col.kind}
          style={colStyle(
            col.kind === 'laborDate' || col.kind === 'laborMethod' ? COL_WIDTH.labor : COL_WIDTH.income,
          )}
        />
      ))}
      <col style={noteColStyle()} />
    </colgroup>
  );

  const yearEndColGroup = () => (
    <colgroup>
      <col style={colStyle(COL_WIDTH.no)} />
      <col style={colStyle(COL_WIDTH.code)} />
      <col style={colStyle(COL_WIDTH.company)} />
      <col style={colStyle(COL_WIDTH.biz)} />
      {yearEndCols.map(col => (
        <col key={col.key} style={colStyle(COL_WIDTH.income)} />
      ))}
      <col style={noteColStyle()} />
    </colgroup>
  );

  return (
    <table className="w-full table-fixed text-sm">
      {mode === 'simplePayroll' ? simpleColGroup() : yearEndColGroup()}
      <thead>
        {mode === 'simplePayroll' ? (
          simpleHeader()
        ) : (
          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <th style={colStyle(COL_WIDTH.no)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">순번</th>
            <th style={colStyle(COL_WIDTH.code)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">코드</th>
            <th style={colStyle(COL_WIDTH.company)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">업체명</th>
            <th style={colStyle(COL_WIDTH.biz)} className="whitespace-nowrap px-2 py-2 text-center font-semibold">사업자번호</th>
            {yearEndCols.map(col => (
              <th key={col.key} className="px-1 py-2 text-center font-semibold">
                {col.label}
                {renderColCount(col.key)}
              </th>
            ))}
            <th style={noteColStyle()} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
              특이사항
            </th>
          </tr>
        )}
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={colSpan} className="py-10 text-center text-slate-400">
              불러오는 중…
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={colSpan} className="py-10 text-center text-slate-400">
              대상 업체가 없습니다.
            </td>
          </tr>
        ) : (
          rows.map((row, i) => {
            const excluded = isExcluded(row);
            return (
              <tr
                key={row.clientId}
                className={`border-b border-slate-50 ${excluded ? 'bg-slate-50/80' : ''}`}
              >
                <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-400">
                  {i + 1}
                </td>
                <td className="px-2 py-2 text-center text-sm tabular-nums text-slate-500">
                  {row.douzoneCode || '-'}
                </td>
                <td className="max-w-0 px-2 py-2">
                  <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenSettings(row.clientId, row.companyName)}
                      onDoubleClick={e => {
                        e.preventDefault();
                        if (!locked) onToggleExclude(row.clientId);
                      }}
                      className={`shrink-0 text-left text-sm font-semibold hover:underline ${
                        excluded
                          ? 'text-slate-400 line-through decoration-slate-400'
                          : 'text-slate-800 hover:text-blue-600'
                      }`}
                      title={
                        excluded
                          ? locked
                            ? '원천세 제외'
                            : '더블클릭 — 원천세 제외 해제(복구)'
                          : locked
                            ? [row.companyName, row.representative].filter(Boolean).join(' · ') ||
                              '(이름 없음)'
                            : '클릭 — 설정 · 더블클릭 — 원천세 제외'
                      }
                    >
                      {row.companyName || '(이름 없음)'}
                    </button>
                    {row.representative ? (
                      <span className="shrink-0 text-xs text-slate-400">{row.representative}</span>
                    ) : null}
                  </div>
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-center text-sm tabular-nums ${
                    excluded ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {row.businessNo || '-'}
                </td>

                {excluded ? (
                  <td colSpan={incomeColCount} className="px-2 py-2 text-center">
                    <div className="flex min-h-9 items-center justify-center">
                      <span className="whitespace-nowrap rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        원천세 제외
                      </span>
                    </div>
                  </td>
                ) : mode === 'simplePayroll'
                  ? simpleCols.map((col, colIdx) => {
                      const showExcludeBadge = excluded && colIdx === 0;
                      if (col.kind === 'laborDate' || col.kind === 'laborMethod') {
                        const labor = row.cells.laborContentReport ?? {
                          active: false,
                          filed: false,
                        };
                        if (showExcludeBadge) {
                          return renderExcludeBadgeCell(
                            col.kind,
                            col.kind === 'laborDate' ? 'border-l border-slate-50' : undefined,
                          );
                        }
                        if (!labor.active) {
                          return renderInactiveCell(
                            row,
                            col.kind,
                            onActivate,
                            '근로내용확인신고',
                            excluded,
                            locked,
                            'laborContentReport',
                            col.kind === 'laborDate' ? 'border-l border-slate-50' : undefined,
                          );
                        }
                        const field =
                          col.kind === 'laborDate' ? 'acceptanceDate' : 'acceptanceMethod';
                        const placeholder = col.label;
                        const isFirstLaborCol = col.kind === 'laborDate';
                        return (
                          <td
                            key={col.kind}
                            className={`px-1 py-2 ${isFirstLaborCol ? 'border-l border-slate-50' : ''}`}
                          >
                            <input
                              value={labor[field] ?? ''}
                              onChange={e =>
                                !excluded &&
                                !locked &&
                                onPatchLabor?.(row.clientId, { [field]: e.target.value })
                              }
                              onDoubleClick={() =>
                                !excluded && !locked && onDeactivate(row.clientId, 'laborContentReport')
                              }
                              readOnly={excluded || locked}
                              disabled={excluded || locked}
                              placeholder={placeholder}
                              title={
                                excluded
                                  ? '원천세 제외 — 더블클릭 업체명으로 복구'
                                  : '더블클릭 — 근로내용확인 비활성화'
                              }
                              className={`${inputCls} box-border w-full min-w-0 ${excluded ? 'cursor-not-allowed opacity-50' : ''}`}
                            />
                          </td>
                        );
                      }

                      const cell = row.cells[col.key] ?? { active: false, filed: false };
                      if (col.semiAnnual && cell.applicable === false) {
                        return renderNaCell(col.key, excluded, showExcludeBadge);
                      }
                      if (showExcludeBadge) {
                        return renderExcludeBadgeCell(col.key);
                      }
                      if (!cell.active) {
                        return renderInactiveCell(
                          row,
                          col.key,
                          onActivate,
                          col.label,
                          excluded,
                          locked,
                        );
                      }
                      return (
                        <td key={col.key} className="px-1 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={cell.filed}
                            disabled={excluded || locked}
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={() => !excluded && !locked && onDeactivate(row.clientId, col.key)}
                            onChange={e =>
                              !excluded && !locked && onToggleFiled(row.clientId, col.key, e.target.checked)
                            }
                            className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                            title={
                              excluded
                                ? '원천세 제외'
                                : locked
                                  ? '완료 처리됨'
                                  : '더블클릭 — 소득유형 비활성화'
                            }
                          />
                        </td>
                      );
                    })
                  : yearEndCols.map((col, colIdx) => {
                      const showExcludeBadge = excluded && colIdx === 0;
                      if (showExcludeBadge) {
                        return renderExcludeBadgeCell(col.key);
                      }
                      const cell = row.cells[col.key] ?? { active: false, filed: false };
                      if (!cell.active) {
                        return renderInactiveCell(row, col.key, onActivate, col.label, excluded, locked);
                      }
                      return (
                        <td key={col.key} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={cell.filed}
                            disabled={excluded || locked}
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={() => !excluded && !locked && onDeactivate(row.clientId, col.key)}
                            onChange={e =>
                              !excluded && !locked && onToggleFiled(row.clientId, col.key, e.target.checked)
                            }
                            className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                            title={
                              excluded ? '원천세 제외' : '더블클릭 — 소득유형 비활성화'
                            }
                          />
                        </td>
                      );
                    })}

                <td className="px-2 py-2">
                  <input
                    value={excluded ? (row.excludeReason ?? '') : (row.rowNote ?? '')}
                    onChange={e =>
                      excluded
                        ? onSetExcludeReason?.(row.clientId, e.target.value)
                        : onSetRowNote?.(row.clientId, e.target.value)
                    }
                    readOnly={locked || (excluded ? !onSetExcludeReason : !onSetRowNote)}
                    placeholder={excluded ? '제외 사유 (예: 폐업·무실적)' : '신고 특이사항'}
                    className={`${inputCls} box-border w-full min-w-0 text-slate-700 ${
                      locked || (excluded ? !onSetExcludeReason : !onSetRowNote)
                        ? 'cursor-default opacity-80'
                        : excluded
                          ? 'border-slate-300 focus:border-slate-400'
                          : ''
                    }`}
                  />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
