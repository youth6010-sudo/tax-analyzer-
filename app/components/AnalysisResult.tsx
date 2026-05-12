'use client';

import type { AnalysisResult } from '../types';
import { formatKRW, formatPct } from '../utils/calculator';

interface Props {
  result: AnalysisResult;
  onReset: () => void;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:rounded-none ${className}`}>
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

export default function AnalysisResultView({ result, onReset }: Props) {
  const {
    reportData, industryRate, netIncome, netIncomeRatio,
    simpleExpenseRate, simpleBaseIncome, historicalRatio, diffFromSimpleRate, expenseRatios,
  } = result;

  const caseLabel = reportData.caseType === 'A'
    ? '간편장부신고 (신고유형코드 20 · 총수입금액 및 필요경비 명세서)'
    : reportData.caseType === 'B'
    ? '복식부기신고 (신고유형코드 12 · 표준손익계산서)'
    : '자동 감지';

  const diffColor = diffFromSimpleRate === null ? 'text-gray-400'
    : diffFromSimpleRate > 5 ? 'text-red-600'
    : diffFromSimpleRate > 0 ? 'text-orange-500'
    : 'text-green-600';

  const histColor = historicalRatio === null ? 'text-gray-400'
    : historicalRatio > 110 ? 'text-red-600'
    : historicalRatio > 100 ? 'text-orange-500'
    : 'text-green-600';

  return (
    <div className="space-y-4 analysis-result">
      {/* 헤더 */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-lg font-bold text-gray-900">PDF 분석 결과</h2>
          <p className="text-xs text-gray-400 mt-0.5">{caseLabel}</p>
        </div>
        <button onClick={onReset}
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
          새 파일 분석
        </button>
      </div>
      <div className="hidden print:block border-b border-gray-300 pb-1 mb-2">
        <h2 className="text-sm font-bold text-gray-900">PDF 분석 결과 — {caseLabel}</h2>
      </div>

      {/* 1행: 업종코드 + 수입/경비/소득 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 업종코드 */}
        <Card title="업종코드 및 단순경비율 (A)">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">업종코드</p>
              <p className="text-xl font-black text-gray-900 font-mono">{reportData.industryCode || '-'}</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-3 text-center">
              <p className="text-xs text-indigo-400 mb-1">단순경비율 (일반)</p>
              <p className="text-xl font-black text-indigo-700">{formatPct(industryRate?.simpleRateGeneral ?? null)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 truncate">{industryRate?.name ?? '업종 매칭 실패'}</p>
          {!industryRate && (
            <p className="mt-2 text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">
              ⚠️ 업종코드 &quot;{reportData.industryCode}&quot; 를 찾을 수 없습니다
            </p>
          )}
          <div className="mt-3 space-y-0">
            <Row label="신고유형코드" value={reportData.reportTypeCode || '-'} />
            <Row label="소득구분코드" value={reportData.incomeTypeCode || '-'} />
            <Row label="단순경비율 (초과)" value={formatPct(industryRate?.simpleRateExcess ?? null)} />
          </div>
        </Card>

        {/* 수입/경비/소득 */}
        <Card title="수입 · 경비 · 소득금액">
          <div className="space-y-2 mb-3">
            {[
              { label: '총 수입금액', value: formatKRW(reportData.totalRevenue), bg: 'bg-blue-50 text-blue-800' },
              { label: '필요경비 합계', value: formatKRW(reportData.totalExpenses), bg: 'bg-orange-50 text-orange-800' },
              { label: '소득금액', value: formatKRW(netIncome), bg: 'bg-green-50 text-green-800' },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-xl px-4 py-2.5 flex justify-between items-center`}>
                <span className="text-xs font-medium opacity-70">{item.label}</span>
                <span className="text-sm font-bold font-mono">{item.value}</span>
              </div>
            ))}
          </div>
          <Row label="소득율 (B)" value={formatPct(netIncomeRatio)} highlight />
          <Row label="필요경비율" value={formatPct(reportData.totalRevenue > 0 ? reportData.totalExpenses / reportData.totalRevenue * 100 : 0)} />
        </Card>
      </div>

      {/* 2행: 단순경비율 비교 분석 */}
      <Card title="단순경비율(A) 기준 비교 분석">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: '단순기준 소득금액',
              value: simpleBaseIncome !== null ? formatKRW(simpleBaseIncome) : '-',
              sub: `수입 × ${formatPct(simpleExpenseRate !== null ? 100 - simpleExpenseRate : null)}`,
              color: 'bg-slate-50 text-slate-800',
            },
            {
              label: '실제 소득금액',
              value: formatKRW(netIncome),
              sub: '',
              color: 'bg-green-50 text-green-800',
            },
            {
              label: '과거 표준 대비 소득율',
              value: historicalRatio !== null ? formatPct(historicalRatio) : '-',
              sub: '실제 ÷ 기준 × 100',
              color: `${historicalRatio !== null && historicalRatio > 100 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`,
              boldClass: histColor,
            },
            {
              label: '소득율 차이 (B − 기준)',
              value: diffFromSimpleRate !== null
                ? (diffFromSimpleRate > 0 ? '+' : '') + formatPct(diffFromSimpleRate)
                : '-',
              sub: '',
              color: 'bg-gray-50 text-gray-800',
              boldClass: diffColor,
            },
          ].map(item => (
            <div key={item.label} className={`${item.color} rounded-xl p-3 text-center`}>
              <p className="text-xs opacity-60 mb-1 leading-tight">{item.label}</p>
              <p className={`text-base font-black break-all ${item.boldClass ?? ''}`}>{item.value}</p>
              {item.sub && <p className="text-xs opacity-50 mt-0.5">{item.sub}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* 3행: 항목별 비용 상세 테이블 */}
      {expenseRatios.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:rounded-none">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              항목별 비용 상세 — 작년 실적 기준 (수입금액 대비 비율)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 font-semibold">
                  <th className="text-left px-5 py-2.5">항목</th>
                  <th className="text-right px-4 py-2.5">금액</th>
                  <th className="text-right px-4 py-2.5 w-24">비율</th>
                  <th className="text-left px-4 py-2.5 w-40">비율 바</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenseRatios
                  .sort((a, b) => b.amount - a.amount)
                  .map(item => (
                    <tr key={item.label} className="hover:bg-gray-50/50">
                      <td className="px-5 py-2.5 font-medium text-gray-700 text-xs">{item.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700 text-xs">
                        {item.amount.toLocaleString('ko-KR')}원
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <span className="inline-block bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-bold">
                          {formatPct(item.ratio ?? null)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-gradient-to-r from-blue-400 to-indigo-500 h-2 rounded-full"
                            style={{ width: `${Math.min(item.ratio ?? 0, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-2.5 font-bold text-gray-700 text-xs">합 계</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-700 text-xs">
                    {expenseRatios.reduce((s, i) => s + i.amount, 0).toLocaleString('ko-KR')}원
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-block bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold text-xs">
                      {formatPct(reportData.totalRevenue > 0
                        ? expenseRatios.reduce((s, i) => s + i.amount, 0) / reportData.totalRevenue * 100
                        : null)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center print:hidden">
        ※ PDF 텍스트 추출 방식 분석 · 이미지 스캔본 불가 · 최종 판단은 세무사 상담
      </p>
    </div>
  );
}
