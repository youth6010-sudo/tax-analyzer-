'use client';

import { formatPct } from '../utils/calculator';

/** 업종별 분석 카드·전체 합계 분석에서 동일하게 쓰는 표준대비 소득율 막대·배지 */
export default function IncomeRateStandardCompareBlock({
  incomeRate,
  baseIncomeRate,
  incomeRateDiff,
  pastStdRatio,
}: {
  incomeRate: number;
  baseIncomeRate: number;
  incomeRateDiff: number;
  pastStdRatio: number;
}) {
  return (
    <div className="space-y-1.5 mb-3">
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>
          실제 소득율 <strong className="text-green-600">{formatPct(incomeRate)}</strong>
        </span>
        <span>
          기준 소득율 <strong className="text-indigo-600">{formatPct(baseIncomeRate)}</strong>
        </span>
      </div>
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden no-print">
        <div
          className="absolute left-0 top-0 h-full bg-indigo-300 rounded-full"
          style={{ width: `${Math.min(baseIncomeRate, 100)}%` }}
        />
        <div
          className={`absolute left-0 top-0 h-full rounded-full opacity-80 ${
            incomeRate >= baseIncomeRate ? 'bg-green-400' : 'bg-sky-400'
          }`}
          style={{ width: `${Math.min(Math.max(incomeRate, 0), 100)}%` }}
        />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
            incomeRateDiff >= 0 ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'
          }`}>
          소득율 차이: {incomeRateDiff >= 0 ? '+' : ''}
          {formatPct(incomeRateDiff)} ({incomeRateDiff >= 0 ? '기준 초과' : '기준 미달'})
        </span>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
          표준 대비: {formatPct(pastStdRatio)}
        </span>
      </div>
    </div>
  );
}
