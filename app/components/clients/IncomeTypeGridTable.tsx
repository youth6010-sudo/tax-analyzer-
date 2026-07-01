'use client';

import type { ReactNode } from 'react';
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
  cells: Record<string, GridCellState>;
};

type YearEndColumn = { key: string; label: string };

type Props = {
  mode: 'simplePayroll' | 'yearEnd';
  rows: IncomeGridRow[];
  loading?: boolean;
  employedFilingMonth?: boolean;
  inputCls?: string;
  onOpenSettings: (clientId: string, companyName: string) => void;
  onToggleExclude: (clientId: string) => void;
  onActivate: (clientId: string, incomeType: string) => void;
  onDeactivate: (clientId: string, incomeType: string) => void;
  onToggleFiled: (clientId: string, incomeType: string, filed: boolean) => void;
  onPatchLabor?: (
    clientId: string,
    patch: Partial<{ acceptanceDate: string; acceptanceMethod: string }>,
  ) => void;
};

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
) {
  if (excluded) {
    return (
      <td key={colKey} className="px-2 py-2 text-center text-slate-200">
        —
      </td>
    );
  }
  return (
    <td key={colKey} className="px-2 py-2 text-center">
      <button
        type="button"
        onClick={() => onActivate(row.clientId, colKey)}
        className="w-full rounded-lg py-2 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-500"
        title={`클릭하여 ${label} 활성화`}
      >
        —
      </button>
    </td>
  );
}

function renderNaCell(colKey: string) {
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
  onOpenSettings,
  onToggleExclude,
  onActivate,
  onDeactivate,
  onToggleFiled,
  onPatchLabor,
}: Props) {
  const simpleCols = SIMPLE_PAYROLL_GRID_COLUMNS;
  const yearEndCols = YEAR_END_COLUMNS as readonly YearEndColumn[];
  const incomeColCount = mode === 'simplePayroll' ? simpleCols.length : yearEndCols.length;
  const colSpan = 4 + incomeColCount;

  const simpleHeader = () => {
    const row1: ReactNode[] = [];
    const row2: ReactNode[] = [];
    let laborGroupStarted = false;

    for (const col of simpleCols) {
      if (col.kind === 'filed') {
        row1.push(
          <th key={col.key} rowSpan={2} className="px-1 py-2 text-center font-semibold">
            {col.label}
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
          <th rowSpan={2} className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">
            순번
          </th>
          <th rowSpan={2} className="w-20 whitespace-nowrap px-2 py-2 text-left font-semibold">
            코드
          </th>
          <th rowSpan={2} className="w-48 whitespace-nowrap px-2 py-2 text-left font-semibold">
            업체명
          </th>
          <th rowSpan={2} className="w-32 whitespace-nowrap px-2 py-2 text-left font-semibold">
            사업자번호
          </th>
          {row1}
        </tr>
        <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500">{row2}</tr>
      </>
    );
  };

  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        {mode === 'simplePayroll' ? (
          simpleHeader()
        ) : (
          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">순번</th>
            <th className="w-20 whitespace-nowrap px-2 py-2 text-left font-semibold">코드</th>
            <th className="w-48 whitespace-nowrap px-2 py-2 text-left font-semibold">업체명</th>
            <th className="w-32 whitespace-nowrap px-2 py-2 text-left font-semibold">사업자번호</th>
            {yearEndCols.map(col => (
              <th key={col.key} className="px-1 py-2 text-center font-semibold">
                {col.label}
              </th>
            ))}
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
                <td className="px-2 py-2 tabular-nums text-slate-500">{row.douzoneCode || '-'}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onOpenSettings(row.clientId, row.companyName)}
                    onDoubleClick={e => {
                      e.preventDefault();
                      onToggleExclude(row.clientId);
                    }}
                    className={`break-words text-left font-semibold hover:underline ${
                      excluded
                        ? 'text-slate-400 line-through decoration-slate-400'
                        : 'text-slate-800 hover:text-blue-600'
                    }`}
                    title={
                      excluded
                        ? '더블클릭 — 원천세 제외 해제(복구)'
                        : '클릭 — 설정 · 더블클릭 — 원천세 제외'
                    }
                  >
                    {row.companyName || '(이름 없음)'}
                  </button>
                  {row.representative && (
                    <span
                      className={`ml-1 text-xs ${excluded ? 'text-slate-300' : 'text-slate-400'}`}
                    >
                      {row.representative}
                    </span>
                  )}
                  {excluded && (
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      원천세 제외
                    </span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 tabular-nums ${
                    excluded ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {row.businessNo || '-'}
                </td>

                {mode === 'simplePayroll'
                  ? simpleCols.map(col => {
                      if (col.kind === 'laborDate' || col.kind === 'laborMethod') {
                        const labor = row.cells.laborContentReport ?? {
                          active: false,
                          filed: false,
                        };
                        if (!labor.active) {
                          return renderInactiveCell(
                            row,
                            col.kind,
                            onActivate,
                            '근로내용확인신고',
                            excluded,
                          );
                        }
                        const field =
                          col.kind === 'laborDate' ? 'acceptanceDate' : 'acceptanceMethod';
                        const placeholder = col.label;
                        return (
                          <td key={col.kind} className="border-l border-slate-50 px-1 py-2">
                            <input
                              value={labor[field] ?? ''}
                              onChange={e =>
                                !excluded &&
                                onPatchLabor?.(row.clientId, { [field]: e.target.value })
                              }
                              onDoubleClick={() =>
                                !excluded && onDeactivate(row.clientId, 'laborContentReport')
                              }
                              readOnly={excluded}
                              disabled={excluded}
                              placeholder={placeholder}
                              title={
                                excluded
                                  ? '원천세 제외 — 더블클릭 업체명으로 복구'
                                  : '더블클릭 — 근로내용확인 비활성화'
                              }
                              className={`${inputCls} w-full ${excluded ? 'cursor-not-allowed opacity-50' : ''}`}
                            />
                          </td>
                        );
                      }

                      const cell = row.cells[col.key] ?? { active: false, filed: false };
                      if (col.semiAnnual && !employedFilingMonth) {
                        return renderNaCell(col.key);
                      }
                      if (!cell.active) {
                        return renderInactiveCell(row, col.key, onActivate, col.label, excluded);
                      }
                      return (
                        <td key={col.key} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={cell.filed}
                            disabled={excluded}
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={() => !excluded && onDeactivate(row.clientId, col.key)}
                            onChange={e =>
                              !excluded && onToggleFiled(row.clientId, col.key, e.target.checked)
                            }
                            className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                            title={
                              excluded
                                ? '원천세 제외'
                                : '더블클릭 — 소득유형 비활성화'
                            }
                          />
                        </td>
                      );
                    })
                  : yearEndCols.map(col => {
                      const cell = row.cells[col.key] ?? { active: false, filed: false };
                      if (!cell.active) {
                        return renderInactiveCell(row, col.key, onActivate, col.label, excluded);
                      }
                      return (
                        <td key={col.key} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={cell.filed}
                            disabled={excluded}
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={() => !excluded && onDeactivate(row.clientId, col.key)}
                            onChange={e =>
                              !excluded && onToggleFiled(row.clientId, col.key, e.target.checked)
                            }
                            className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                            title={
                              excluded
                                ? '원천세 제외'
                                : '더블클릭 — 소득유형 비활성화'
                            }
                          />
                        </td>
                      );
                    })}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
