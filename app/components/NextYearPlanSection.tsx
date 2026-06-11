'use client';

import { Fragment, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { formatKRW, formatPct } from '../utils/calculator';
import type { IndustryRate } from '../types';
import type { SimPersist } from '../utils/taxSessionStorage';
import {
  EXPENSE_ITEMS,
  customExpenseKey,
  initExpenses,
  mergeDetailExpenses,
  sumExpenseInputs,
  type RowDetail,
} from '../lib/expenseTableModel';
import { fmt, toNum } from '../lib/taxAmountFmt';
import type { BusinessRow } from '../lib/businessRowCompute';
import { computeRow } from '../lib/businessRowCompute';
import ExpenseRatioTable from './ExpenseRatioTable';
import IncomeRateStandardCompareBlock from './IncomeRateStandardCompareBlock';

export interface NextYearPlanProps {
  allRates: Record<string, IndustryRate>;
  currYear: string;
  taxpayer: string;
  makeNyRow: () => BusinessRow;
  rows: BusinessRow[];
  setRows: Dispatch<SetStateAction<BusinessRow[]>>;
  rowDetails: Record<string, RowDetail>;
  setRowDetails: Dispatch<SetStateAction<Record<string, RowDetail>>>;
  analyzed: boolean;
  setAnalyzed: (v: boolean) => void;
  printExpDetail: boolean;
  setPrintExpDetail: (v: boolean) => void;
  /** 위 소득금액 시뮬레이션 행 — 업종코드·예상 수입 자동 반영 */
  simulationSnapshot: SimPersist | null;
}

let _nyCustomItemUid = 0;
const nextNyCustomExpenseId = () => String(++_nyCustomItemUid);

export function bumpNyCustomUidFromRowDetails(details: Record<string, RowDetail>) {
  for (const rd of Object.values(details)) {
    for (const c of rd.customDefs ?? []) {
      const n = parseInt(c.id, 10);
      if (!Number.isNaN(n)) _nyCustomItemUid = Math.max(_nyCustomItemUid, n);
    }
  }
}

export function resetNyCustomItemUid() {
  _nyCustomItemUid = 0;
}

export default function NextYearPlanSection({
  allRates,
  currYear,
  taxpayer,
  makeNyRow,
  rows,
  setRows,
  rowDetails,
  setRowDetails,
  analyzed,
  setAnalyzed,
  printExpDetail,
  setPrintExpDetail,
  simulationSnapshot,
}: NextYearPlanProps) {
  const prevSimRowSig = useRef<string>('');

  // 시뮬 행(code·revenue) 변경 시에만 반영. makeNyRow는 page에서 매 렌더 새 함수일 수 있어 deps 제외.
  useEffect(() => {
    const sim = simulationSnapshot;
    if (!sim?.rows?.length) return;
    const sig = sim.rows
      .map(r => `${String(r.code ?? '').replace(/\D/g, '')}|${String(r.revenue ?? '').replace(/[^0-9]/g, '')}`)
      .join(';');
    if (sig === prevSimRowSig.current) return;
    prevSimRowSig.current = sig;

    setRows(prev =>
      sim.rows.map((sr, idx) => {
        const prevRow = prev[idx];
        const code = String(sr.code ?? '').replace(/\D/g, '').slice(0, 6);
        const revenue = fmt(String(sr.revenue ?? ''));
        return {
          id: prevRow?.id ?? makeNyRow().id,
          industryCode: code,
          totalRevenue: revenue,
          totalExpenses: prevRow?.totalExpenses ?? '',
        };
      }),
    );
  }, [simulationSnapshot, setRows]);

  useEffect(() => {
    const keep = new Set(rows.map(r => r.id));
    setRowDetails(prev => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!keep.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows, setRowDetails]);

  const getDetail = (id: string): RowDetail => {
    const raw = rowDetails[id];
    if (!raw) return { show: false, expenses: initExpenses(), customDefs: [] };
    return {
      show: raw.show,
      customDefs: raw.customDefs ?? [],
      expenses: mergeDetailExpenses(raw),
    };
  };

  const updateRow = (id: string, field: keyof BusinessRow, value: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        if (field === 'industryCode') return { ...r, industryCode: value.replace(/[^0-9]/g, '').slice(0, 6) };
        return { ...r, [field]: fmt(value) };
      }),
    );
  };

  const addRow = () => setRows(prev => [...prev, makeNyRow()]);
  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter(r => r.id !== id));
      setRowDetails(prev => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  };

  const toggleDetail = (id: string) => {
    setRowDetails(prev => {
      const cur = prev[id] ?? { show: false, expenses: initExpenses(), customDefs: [] };
      return { ...prev, [id]: { ...cur, show: !cur.show } };
    });
  };

  const updateRowExpense = (rowId: string, key: string, value: string) => {
    setRowDetails(prev => {
      const cur = prev[rowId] ?? { show: true, expenses: initExpenses(), customDefs: [] };
      return { ...prev, [rowId]: { ...cur, expenses: { ...mergeDetailExpenses(cur), [key]: fmt(value) } } };
    });
  };

  const addCustomExpenseItem = (rowId: string) => {
    const cid = nextNyCustomExpenseId();
    setRowDetails(prev => {
      const cur = prev[rowId] ?? { show: true, expenses: initExpenses(), customDefs: [] };
      const k = customExpenseKey(cid);
      return {
        ...prev,
        [rowId]: {
          ...cur,
          customDefs: [...(cur.customDefs ?? []), { id: cid, label: '추가항목' }],
          expenses: { ...mergeDetailExpenses(cur), [k]: '' },
        },
      };
    });
  };

  const updateCustomExpenseLabel = (rowId: string, customId: string, label: string) => {
    setRowDetails(prev => {
      const cur = prev[rowId];
      if (!cur) return prev;
      return {
        ...prev,
        [rowId]: {
          ...cur,
          customDefs: (cur.customDefs ?? []).map(x => (x.id === customId ? { ...x, label } : x)),
        },
      };
    });
  };

  const removeCustomExpenseItem = (rowId: string, customId: string) => {
    const k = customExpenseKey(customId);
    setRowDetails(prev => {
      const cur = prev[rowId];
      if (!cur) return prev;
      const merged = mergeDetailExpenses(cur);
      const { [k]: _removed, ...rest } = merged;
      return {
        ...prev,
        [rowId]: {
          ...cur,
          customDefs: (cur.customDefs ?? []).filter(x => x.id !== customId),
          expenses: rest,
        },
      };
    });
  };

  const handleNyAnalyze = () => {
    const hasRevenue = rows.some(r => toNum(r.totalRevenue) > 0);
    if (!hasRevenue) return;
    setAnalyzed(true);
  };

  const computed = rows.map(r => computeRow(r, allRates, toNum));
  const activeRows = computed.filter(c => c.revNum > 0);
  const canAnalyze = rows.some(r => toNum(r.totalRevenue) > 0);
  const totalRev = computed.reduce((s, r) => s + r.revNum, 0);
  const totalExp = computed.reduce((s, r) => s + r.expNum, 0);
  const totalNet = totalRev - totalExp;
  const totalRate = totalRev > 0 ? (totalNet / totalRev) * 100 : 0;
  const totalBaseIncome = computed.reduce((s, r) => s + r.baseIncome, 0);
  const totalBaseIncomeRate =
    totalRev > 0 ? (totalBaseIncome / totalRev) * 100 : 0;
  const totalPastStdRatio =
    totalBaseIncome > 0 ? (totalNet / totalBaseIncome) * 100 : 0;
  const totalIncomeRateDiff = totalRate - totalBaseIncomeRate;
  const hasAnyExpDetail = rows.some(r => sumExpenseInputs(getDetail(r.id), toNum) > 0);

  const y = currYear.trim();
  const yearPrefix = y ? `${y}년 ` : '';

  return (
    <>
      <div className="border-t-2 border-dashed border-gray-200 no-print my-2" />

      <div className="space-y-4 bg-blue-50/40 rounded-3xl border border-blue-100 p-5 shadow-sm">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-gray-800">
                {y ? `${y}년 ` : ''}총수입금액 및 필요경비 명세
              </h3>
              <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
                위 소득금액 시뮬레이션과 같은 과세연도·행 기준입니다. 업종코드·총수입은 시뮬과 동기화되며 필요경비는 여기서 입력합니다. 전기 분석·인쇄 옵션과는 별도입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow shrink-0">
              항목 추가
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[11px]">
                  <th className="text-left px-2 py-2 font-semibold w-6">#</th>
                  <th className="text-left px-2 py-2 font-semibold">주업종코드</th>
                  <th className="text-right px-2 py-2 font-semibold">총수입금액</th>
                  <th className="text-right px-2 py-2 font-semibold">필요경비합계</th>
                  <th className="text-right px-2 py-2 font-semibold text-green-700">소득금액</th>
                  <th className="text-right px-2 py-2 font-semibold text-blue-700">실제소득율</th>
                  <th className="text-right px-2 py-2 font-semibold text-indigo-700">단순경비율 / 기준소득율</th>
                  <th className="text-right px-2 py-2 font-semibold text-indigo-600">기준소득금액</th>
                  <th className="text-right px-2 py-2 font-semibold text-purple-700">표준대비</th>
                  <th className="text-center px-2 py-2 font-semibold text-amber-600 w-16">상세분석</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const c = computed[idx];
                  const detail = getDetail(row.id);
                  const matched = c.industryRate;
                  const hasDetail = sumExpenseInputs(detail, toNum) > 0;
                  const expTotal = sumExpenseInputs(detail, toNum);
                  const expDiff = c.expNum - expTotal;
                  const expDenom = c.expNum > 0 ? c.expNum : expTotal > 0 ? expTotal : 0;

                  return (
                    <Fragment key={row.id}>
                      <tr className={`border-t border-gray-50 hover:bg-gray-50/40 ${detail.show ? 'bg-amber-50/20' : ''}`}>
                        <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-2 py-1.5 min-w-[130px]">
                          <input
                            type="text"
                            maxLength={6}
                            value={row.industryCode}
                            onChange={e => updateRow(row.id, 'industryCode', e.target.value)}
                            placeholder="6자리"
                            className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          {matched && (
                            <p className="text-[10px] text-green-700 font-medium mt-0.5 leading-tight" title={`${matched.name} / ${matched.subClass}`}>
                              ✓ {matched.name}
                              {matched.subClass && matched.subClass !== matched.name && (
                                <>
                                  <span className="text-gray-400 mx-0.5">/</span>
                                  <span className="text-green-700">{matched.subClass}</span>
                                </>
                              )}
                            </p>
                          )}
                          {row.industryCode.length === 6 && !matched && (
                            <p className="text-[10px] text-red-400">코드 없음</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            value={row.totalRevenue}
                            onChange={e => updateRow(row.id, 'totalRevenue', e.target.value)}
                            placeholder="0"
                            className="w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            value={row.totalExpenses}
                            onChange={e => updateRow(row.id, 'totalExpenses', e.target.value)}
                            placeholder="0"
                            className="w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          {hasDetail && (
                            <p
                              className={`text-[10px] mt-0.5 text-right ${Math.abs(expDiff) < 1000 ? 'text-green-500' : 'text-red-400'}`}>
                              항목합계 {expTotal.toLocaleString('ko-KR')}
                              {Math.abs(expDiff) >= 1000 && ` (차 ${expDiff > 0 ? '+' : ''}${expDiff.toLocaleString('ko-KR')})`}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.revNum > 0 ? (
                            <span className={`font-bold font-mono text-xs ${c.netIncome >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {c.netIncome.toLocaleString('ko-KR')}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.revNum > 0 ? (
                            <span className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                              {formatPct(c.incomeRate)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {matched ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="inline-block bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                경비 {formatPct(matched.simpleRateGeneral)}
                              </span>
                              <span className="text-gray-300 text-[10px]">/</span>
                              <span className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                소득 {formatPct(matched.simpleRateGeneral === null ? null : 100 - matched.simpleRateGeneral)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.baseIncome > 0 ? (
                            <span className="font-mono text-indigo-600 font-semibold text-xs">{c.baseIncome.toLocaleString('ko-KR')}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {c.revNum > 0 && c.industryRate ? (
                            <div className="space-y-0.5 text-right">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded font-bold text-[11px] ${
                                  c.incomeRateDiff >= 0 ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'
                                }`}>
                                {c.incomeRateDiff >= 0 ? '+' : ''}
                                {formatPct(c.incomeRateDiff)}
                              </span>
                              <p className="text-[10px] text-purple-500 font-semibold">{formatPct(c.pastStdRatio)}</p>
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleDetail(row.id)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              detail.show
                                ? 'bg-amber-500 text-white border-amber-500'
                                : hasDetail
                                  ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                                  : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                            }`}>
                            {detail.show ? '▲ 접기' : hasDetail ? '✓ 상세' : '+ 상세'}
                          </button>
                        </td>
                        <td className="px-1 py-2 text-center">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(row.id)}
                              className="w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center">
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                      {detail.show && (
                        <tr className="border-t border-amber-100">
                          <td colSpan={11} className="p-0">
                            <div className="bg-amber-50/40 border-l-4 border-amber-400 px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-amber-800">
                                  #{idx + 1} {matched?.name ?? row.industryCode} — 필요경비 항목별 입력
                                </span>
                                {c.expNum > 0 && (
                                  <span
                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                      Math.abs(expDiff) < 1000 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                                    }`}>
                                    항목합계 {expTotal.toLocaleString('ko-KR')} / 필요경비 {c.expNum.toLocaleString('ko-KR')}
                                    {Math.abs(expDiff) >= 1000 && ` → 차액 ${expDiff > 0 ? '+' : ''}${expDiff.toLocaleString('ko-KR')}`}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {EXPENSE_ITEMS.map(item => {
                                  const num = toNum(detail.expenses[item.key]);
                                  const revRatio = c.revNum > 0 && num > 0 ? (num / c.revNum) * 100 : null;
                                  const expRatio = expDenom > 0 && num > 0 ? (num / expDenom) * 100 : null;
                                  return (
                                    <div key={item.key} className="flex items-center gap-1.5">
                                      <div className="shrink-0 w-20 text-[10px] font-semibold text-gray-600 leading-tight">{item.label}</div>
                                      <input
                                        type="text"
                                        value={detail.expenses[item.key]}
                                        onChange={e => updateRowExpense(row.id, item.key, e.target.value)}
                                        placeholder="0"
                                        className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-right font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                      />
                                      {num <= 0 ? (
                                        <span className="shrink-0 w-10 text-gray-300 text-center text-[10px]">-</span>
                                      ) : (
                                        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[3.35rem]">
                                          {revRatio !== null && (
                                            <span className="text-[10px] font-bold text-amber-700 leading-tight">매출 {revRatio.toFixed(1)}%</span>
                                          )}
                                          {expRatio !== null && (
                                            <span className="text-[10px] font-bold text-indigo-700 leading-tight">경비 {expRatio.toFixed(1)}%</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-3 pt-2 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-2 no-print">
                                <span className="text-[10px] font-bold text-amber-800 shrink-0">추가 필요경비 항목</span>
                                <button
                                  type="button"
                                  onClick={() => addCustomExpenseItem(row.id)}
                                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors">
                                  + 항목 추가
                                </button>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                                {(detail.customDefs ?? []).map(cd => {
                                  const k = customExpenseKey(cd.id);
                                  const num = toNum(detail.expenses[k]);
                                  const revRatio = c.revNum > 0 && num > 0 ? (num / c.revNum) * 100 : null;
                                  const expRatio = expDenom > 0 && num > 0 ? (num / expDenom) * 100 : null;
                                  return (
                                    <div key={cd.id} className="flex items-center gap-1.5 sm:col-span-2">
                                      <input
                                        type="text"
                                        value={cd.label}
                                        onChange={e => updateCustomExpenseLabel(row.id, cd.id, e.target.value)}
                                        placeholder="항목명"
                                        maxLength={16}
                                        className="shrink-0 w-[5.5rem] border border-amber-200 rounded-lg px-1.5 py-1.5 text-[10px] font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                      />
                                      <input
                                        type="text"
                                        value={detail.expenses[k] ?? ''}
                                        onChange={e => updateRowExpense(row.id, k, e.target.value)}
                                        placeholder="0"
                                        className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-right font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                      />
                                      {num <= 0 ? (
                                        <span className="shrink-0 w-10 text-gray-300 text-center text-[10px]">-</span>
                                      ) : (
                                        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[3.35rem]">
                                          {revRatio !== null && (
                                            <span className="text-[10px] font-bold text-amber-700 leading-tight">매출 {revRatio.toFixed(1)}%</span>
                                          )}
                                          {expRatio !== null && (
                                            <span className="text-[10px] font-bold text-indigo-700 leading-tight">경비 {expRatio.toFixed(1)}%</span>
                                          )}
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => removeCustomExpenseItem(row.id, cd.id)}
                                        className="no-print shrink-0 px-1.5 py-1 text-[9px] font-bold text-red-500 hover:bg-red-50 rounded border border-red-200">
                                        삭제
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {rows.length >= 2 && (
                <tfoot>
                  <tr className="bg-gray-800 text-white text-xs font-bold">
                    <td colSpan={2} className="px-3 py-2.5">
                      합 계
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono">{totalRev.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-2.5 text-right font-mono">{totalExp.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-green-300">{totalNet.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="bg-blue-400/30 text-blue-100 px-2 py-0.5 rounded">{formatPct(totalRate)}</span>
                    </td>
                    <td colSpan={5} className="px-2 py-2.5 text-gray-400 text-[10px]">
                      경비율 {formatPct(totalRev > 0 ? (totalExp / totalRev) * 100 : 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="no-print px-5 py-4 border-t border-gray-100 bg-gray-50/40">
            <button
              type="button"
              onClick={handleNyAnalyze}
              disabled={!canAnalyze}
              className={`w-full py-3 rounded-xl font-bold text-sm shadow transition-all ${
                canAnalyze
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}>
              {yearPrefix}자료 분석하기
            </button>
            {!canAnalyze && (
              <p className="mt-2 text-[11px] text-gray-500 text-center">총수입금액에 숫자를 넣으면 분석할 수 있습니다.</p>
            )}
          </div>
        </div>

        {analyzed && (
          <div className="space-y-4 bg-red-50/30 rounded-3xl border border-red-100 p-5 shadow-sm">
            <div className="analysis-section-print-top space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between w-full">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-1.5 h-8 bg-gradient-to-b from-red-500 to-red-600 rounded-full shrink-0" />
                <h2 className="text-2xl font-black tracking-tight analysis-screen-title">
                  <mark className="bg-red-100 px-2 py-0.5 rounded inline-block">
                    {y && <span className="text-red-600">{y}년 </span>}
                    <span className="text-gray-900">업종코드별 단순경비율 대비 분석</span>
                  </mark>
                </h2>
              </div>
              {hasAnyExpDetail && (
                <div className="shrink-0 sm:self-start">
                  <label className="no-print flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={printExpDetail}
                      onChange={e => setPrintExpDetail(e.target.checked)}
                      className="w-4 h-4 accent-red-600 rounded"
                    />
                    <span className="text-xs font-bold text-red-800">{yearPrefix}항목별 비율분석 인쇄</span>
                  </label>
                </div>
              )}
            </div>

            {activeRows.length >= 2 && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-5 no-break print-summary-total">
                <h3 className="text-sm font-bold text-gray-700 mb-4 print-summary-total-heading">
                  전체 합계 분석{y ? ` (${y}년)` : ''}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-blue-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-blue-500 mb-1.5">총수입금액 합계</p>
                    <p className="text-base font-bold text-blue-700 font-mono">{formatKRW(totalRev)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-red-600 mb-1.5">필요경비 합계</p>
                    <p className="text-base font-bold text-red-700 font-mono">{formatKRW(totalExp)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatPct(totalRev > 0 ? (totalExp / totalRev) * 100 : 0)}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-green-600 mb-1.5">소득금액 합계</p>
                    <p className="text-base font-bold text-green-700 font-mono">{formatKRW(totalNet)}</p>
                    <p className="text-xs text-green-600 font-bold mt-0.5">{formatPct(totalRate)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-gray-500 mb-1.5">단순경비율 기준 소득금액 합계</p>
                    <p className="text-base font-bold text-gray-800 font-mono">{formatKRW(totalBaseIncome)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatPct(totalBaseIncomeRate)}</p>
                  </div>
                </div>
                {totalBaseIncome > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-100">
                    <IncomeRateStandardCompareBlock
                      incomeRate={totalRate}
                      baseIncomeRate={totalBaseIncomeRate}
                      incomeRateDiff={totalIncomeRateDiff}
                      pastStdRatio={totalPastStdRatio}
                    />
                  </div>
                )}
              </div>
            )}
            </div>{/* analysis-section-print-top */}

            <div className="grid gap-3">
              {activeRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-red-200 bg-white/80 px-6 py-8 text-center text-sm text-gray-600">
                  총수입금액을 입력한 행이 없습니다.
                </div>
              ) : (
                activeRows.map((c, idx) => {
                  const detail = getDetail(c.id);
                  const hasExp = sumExpenseInputs(detail, toNum) > 0;
                  const extraExpenseDefs = (detail.customDefs ?? []).map(x => ({
                    key: customExpenseKey(x.id),
                    label: x.label || '추가항목',
                  }));
                  return (
                    <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-break">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 mr-3">
                          <span className="text-xs text-gray-400 font-medium">#{idx + 1} 업종코드</span>
                          <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                            <span className="text-xl font-black text-gray-900 font-mono shrink-0">{c.industryCode || '-'}</span>
                            {c.industryRate && (
                              <span className="text-sm font-semibold text-green-700 leading-snug">
                                {c.industryRate.name}
                                {c.industryRate.subClass && c.industryRate.subClass !== c.industryRate.name && (
                                  <>
                                    <span className="text-gray-400 font-normal mx-1">/</span>
                                    <span className="text-green-700">{c.industryRate.subClass}</span>
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        {c.industryRate && (
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400">단순경비율 (일반)</p>
                            <p className="text-2xl font-black text-indigo-600">{formatPct(c.industryRate.simpleRateGeneral)}</p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-blue-500 mb-1">총수입금액</p>
                          <p className="text-xs font-bold text-blue-700 font-mono">{formatKRW(c.revNum)}</p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-red-600 mb-1">필요경비합계</p>
                          <p className="text-xs font-bold text-red-700 font-mono">{formatKRW(c.expNum)}</p>
                          <p className="text-[10px] text-gray-400">{formatPct(c.expenseRate)}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-2.5 text-center">
                          <p className="text-[10px] text-green-600 mb-1">실제 소득금액</p>
                          <p className="text-xs font-bold text-green-700 font-mono">{formatKRW(c.netIncome)}</p>
                          <p className="text-[10px] text-green-500 font-bold">{formatPct(c.incomeRate)}</p>
                        </div>
                        {c.industryRate ? (
                          <div className="bg-indigo-50 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-indigo-500 mb-1">기준 소득금액</p>
                            <p className="text-xs font-bold text-indigo-700 font-mono">{formatKRW(c.baseIncome)}</p>
                            <p className="text-[10px] text-indigo-400">{formatPct(c.baseIncomeRate)}</p>
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-gray-400">기준 소득금액</p>
                            <p className="text-xs text-gray-300 mt-1">업종코드 필요</p>
                          </div>
                        )}
                      </div>

                      {c.industryRate && c.revNum > 0 && (
                        <IncomeRateStandardCompareBlock
                          incomeRate={c.incomeRate}
                          baseIncomeRate={c.baseIncomeRate}
                          incomeRateDiff={c.incomeRateDiff}
                          pastStdRatio={c.pastStdRatio}
                        />
                      )}

                      {hasExp && (
                        <div className="border-t border-red-100 pt-2 mt-1 no-print">
                          <p className="text-[10px] font-bold text-red-800 mb-1.5">필요경비 항목별 매출·필요경비 내 비율</p>
                          <ExpenseRatioTable
                            expMap={detail.expenses}
                            revenue={c.revNum}
                            necessaryExpense={c.expNum}
                            printClass=""
                            extraDefs={extraExpenseDefs}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}
      </div>

    </>
  );
}
