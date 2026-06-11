'use client';

import { EXPENSE_ITEMS } from '../lib/expenseTableModel';
import type { ExpenseMap } from '../lib/expenseTableModel';
import { toNum } from '../lib/taxAmountFmt';

/** 행의 필요경비합계가 있으면 그 기준, 없으면 입력 항목 합계 기준(내부 구성비). */
function expenseShareDenom(necessaryExpense: number | undefined, itemSum: number): number {
  if (necessaryExpense !== undefined && necessaryExpense > 0) return necessaryExpense;
  return itemSum > 0 ? itemSum : 0;
}

export default function ExpenseRatioTable({
  expMap,
  revenue,
  printClass,
  extraDefs = [],
  necessaryExpense,
}: {
  expMap: ExpenseMap;
  revenue: number;
  printClass: string;
  extraDefs?: { key: string; label: string }[];
  /** 행의 필요경비합계(표 상단 입력). 있으면 각 항목이 여기서 차지하는 비율에 사용. */
  necessaryExpense?: number;
}) {
  const baseDefs = EXPENSE_ITEMS.map(i => ({ key: i.key, label: i.label }));
  const allDefs = [...baseDefs, ...extraDefs];
  const items = allDefs.map(i => ({ ...i, amount: toNum(expMap[i.key]) })).filter(i => i.amount > 0);
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + i.amount, 0);
  const denom = expenseShareDenom(necessaryExpense, total);
  const maxRatio = Math.max(...items.map(i => (revenue > 0 ? (i.amount / revenue) * 100 : 0)));
  const maxShare = Math.max(...items.map(i => (denom > 0 ? (i.amount / denom) * 100 : 0)));
  const denomIsRowExpense =
    necessaryExpense !== undefined && necessaryExpense > 0 && Math.abs(necessaryExpense - total) >= 1;
  return (
    <div className={`${printClass} overflow-x-auto`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-amber-50 text-gray-500 border-b border-amber-100">
            <th className="text-left px-3 py-1.5 font-semibold">항목</th>
            <th className="text-right px-3 py-1.5 font-semibold">금액</th>
            <th className="text-right px-3 py-1.5 font-semibold w-16">매출대비</th>
            <th
              className="text-right px-3 py-1.5 font-semibold w-[4.5rem]"
              title={
                denomIsRowExpense
                  ? '행 필요경비합계 대비 비율입니다. 항목합계와 필요경비가 다르면 합계 행이 100%가 아닐 수 있습니다.'
                  : '입력한 항목 금액 합계 대비 비율입니다(항목 간 구성비).'
              }>
              필요경비 내
            </th>
            <th className="px-3 py-1.5 w-20 no-print">매출</th>
            <th className="px-3 py-1.5 w-20 no-print">경비</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map(e => {
            const ratio = revenue > 0 ? (e.amount / revenue) * 100 : 0;
            const share = denom > 0 ? (e.amount / denom) * 100 : 0;
            const barW = maxRatio > 0 ? (ratio / maxRatio) * 100 : 0;
            const barShare = maxShare > 0 ? (share / maxShare) * 100 : 0;
            return (
              <tr key={e.key} className="hover:bg-gray-50/50">
                <td className="px-3 py-1.5 font-medium text-gray-700">{e.label}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-800">{e.amount.toLocaleString('ko-KR')}</td>
                <td className="px-3 py-1.5 text-right">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      ratio >= 20
                        ? 'bg-red-100 text-red-700'
                        : ratio >= 10
                          ? 'bg-orange-100 text-orange-700'
                          : ratio >= 5
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                    }`}>
                    {ratio.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${
                      share >= 40
                        ? 'bg-violet-100 text-violet-800'
                        : share >= 25
                          ? 'bg-indigo-50 text-indigo-700'
                          : share >= 15
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-gray-100 text-gray-600'
                    }`}>
                    {denom > 0 ? `${share.toFixed(1)}%` : '—'}
                  </span>
                </td>
                <td className="px-3 py-1.5 no-print">
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${barW}%` }} />
                  </div>
                </td>
                <td className="px-3 py-1.5 no-print">
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${barShare}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="bg-amber-50 font-bold border-t border-amber-200">
            <td className="px-3 py-1.5 text-amber-800">합 계</td>
            <td className="px-3 py-1.5 text-right font-mono text-amber-800">{total.toLocaleString('ko-KR')}</td>
            <td className="px-3 py-1.5 text-right">
              <span className="inline-block bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold text-[10px]">
                {revenue > 0 ? ((total / revenue) * 100).toFixed(1) : '0'}%
              </span>
            </td>
            <td className="px-3 py-1.5 text-right">
              <span className="inline-block bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded font-bold text-[10px]">
                {denom > 0 ? `${((total / denom) * 100).toFixed(1)}%` : '—'}
              </span>
            </td>
            <td className="no-print" />
            <td className="no-print" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
