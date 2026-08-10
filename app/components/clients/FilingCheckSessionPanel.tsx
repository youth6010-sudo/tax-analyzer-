'use client';

import {
  portalCard,
} from '@/app/components/portal/uiClasses';
import type { PeriodCompareResult } from '@/lib/filingPeriodCompare';
import type { FilingTaxId } from '@/app/utils/filingCheck';
import {
  multiFilingReasonKey,
  specialFilingKey,
  type SpecialFiling,
} from '@/app/utils/filingCheck';

export type MultiFilingItem = {
  bizNo: string;
  name: string;
  count: number;
};

type CheckRecord = {
  diffReason: string;
  specialFilings: SpecialFiling[];
  specialReasons: Record<string, string>;
  done: boolean;
};

type Props = {
  tax: FilingTaxId;
  locked: boolean;
  carriedFrom: string | null;
  compareLabel: string;
  periodCompare: PeriodCompareResult | null;
  comparePrevLabel?: string;
  compareCurrLabel?: string;
  /** 전월대비 단위 — 간이지급은 활성 칸(건), 그 외 업체(곳) */
  compareCountUnit?: '곳' | '건';
  record: CheckRecord;
  parseError?: string;
  diffHint?: string;
  /** 원천세 — 같은 사업자번호 접수 2건 이상 */
  multiFilings?: MultiFilingItem[];
  onPatch: (patch: Partial<CheckRecord>) => void;
  onSetSpecialReason: (key: string, value: string) => void;
  footer?: React.ReactNode;
};

export default function FilingCheckSessionPanel({
  locked,
  carriedFrom,
  compareLabel,
  periodCompare,
  comparePrevLabel = '이전',
  compareCurrLabel = '이번',
  compareCountUnit = '곳',
  record,
  parseError,
  diffHint,
  multiFilings = [],
  onPatch,
  onSetSpecialReason,
  footer,
}: Props) {
  return (
    <>
      {locked && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          이 신고분은 <strong>완료 처리</strong>되어 수정할 수 없습니다. 수정이 필요하면 아래{' '}
          <strong>완료 취소</strong>를 눌러 주세요.
        </div>
      )}

      {parseError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {parseError}
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold text-slate-700">특이사항 · 차이 사유</label>
          {carriedFrom && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              직전 신고({carriedFrom}) 완료처리 기준 제외·특이사항 불러옴
            </span>
          )}
        </div>
        <textarea
          value={record.diffReason}
          onChange={e => onPatch({ diffReason: e.target.value })}
          readOnly={locked}
          placeholder="예) 폐업 신고 예정 · 무실적 · 자료 미수취 등 — 완료 처리 후 다음 신고에 승계됩니다"
          rows={2}
          className={`w-full rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/40 ${locked ? 'cursor-default opacity-80' : ''}`}
        />
      </div>

      {multiFilings.length > 0 && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <p className="mb-2 text-sm font-semibold text-violet-800">
            같은 사업자번호 복수 접수 {multiFilings.length}곳 — 사유를 적으면 요약에 함께
            들어갑니다. (귀속 지급 등)
          </p>
          <div className="space-y-1.5">
            {multiFilings.map(m => {
              const k = multiFilingReasonKey(m.bizNo);
              return (
                <div key={k} className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-[14rem] items-center gap-1.5 text-sm text-slate-700">
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                      접수 {m.count}건
                    </span>
                    <span className="font-semibold text-slate-800">{m.name || m.bizNo}</span>
                    <span className="tabular-nums text-slate-500">{m.bizNo}</span>
                  </span>
                  <input
                    value={record.specialReasons[k] ?? ''}
                    onChange={e => onSetSpecialReason(k, e.target.value)}
                    readOnly={locked}
                    placeholder="사유 (예: 귀속·지급월 분리 신고)"
                    className={`min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40 ${locked ? 'cursor-default opacity-80' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {record.specialFilings.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <p className="mb-2 text-sm font-semibold text-rose-700">
            수정·기한후·경정청구 신고 {record.specialFilings.length}건 — 사유를 적으면 요약에 함께
            들어갑니다. (「전체」에서는 담당자별 사유가 함께 표시됩니다)
          </p>
          <div className="space-y-1.5">
            {record.specialFilings.map(s => {
              const k = specialFilingKey(s.bizNo, s.type);
              return (
                <div key={k} className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-[14rem] items-center gap-1.5 text-sm text-slate-700">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        s.type === '기한후신고'
                          ? 'bg-rose-100 text-rose-700'
                          : s.type === '수정신고'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {s.type}
                    </span>
                    <span className="font-semibold text-slate-800">{s.name || s.bizNo}</span>
                    <span className="tabular-nums text-slate-500">{s.count}건</span>
                  </span>
                  <input
                    value={record.specialReasons[k] ?? ''}
                    onChange={e => onSetSpecialReason(k, e.target.value)}
                    readOnly={locked}
                    placeholder="사유 (예: 매출 누락 보완, 자료 지연 등)"
                    className={`min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-300/40 ${locked ? 'cursor-default opacity-80' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {periodCompare && (
        <div className={`${portalCard} mb-4 p-4`}>
          <h2 className="mb-2 text-sm font-bold text-slate-800">{compareLabel}</h2>
          <p className="text-sm text-slate-600">
            {periodCompare.byColumn ? (
              <>
                합계 {periodCompare.prevCount}
                {compareCountUnit} → {periodCompare.currCount}
                {compareCountUnit}
              </>
            ) : (
              <>
                {comparePrevLabel} {periodCompare.prevCount}
                {compareCountUnit} → {compareCurrLabel} {periodCompare.currCount}
                {compareCountUnit}
              </>
            )}
            <span
              className={`ml-2 font-semibold tabular-nums ${
                periodCompare.diff === 0
                  ? 'text-slate-500'
                  : periodCompare.diff > 0
                    ? 'text-blue-600'
                    : 'text-rose-600'
              }`}
            >
              ({periodCompare.diff > 0 ? '+' : ''}
              {periodCompare.diff})
            </span>
          </p>
          {periodCompare.byColumn && periodCompare.byColumn.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {periodCompare.byColumn.map(col => (
                <li key={col.key} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-semibold text-slate-800">{col.label}</span>
                    <span className="text-xs text-slate-500">vs {col.prevPeriodLabel}</span>
                    <span className="tabular-nums text-slate-600">
                      {col.prevCount}건 → {col.currCount}건
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        col.diff === 0
                          ? 'text-slate-400'
                          : col.diff > 0
                            ? 'text-blue-600'
                            : 'text-rose-600'
                      }`}
                    >
                      ({col.diff > 0 ? '+' : ''}
                      {col.diff})
                    </span>
                  </div>
                  {col.changedClients.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5 pl-0.5">
                      {col.changedClients.map(c => (
                        <li
                          key={`${col.key}-${c.id}`}
                          className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              c.change === 'added'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.change === 'added' ? '추가' : '제외'}
                          </span>
                          <span className="font-medium text-slate-800">{c.companyName}</span>
                          {c.businessNo && (
                            <span className="tabular-nums text-slate-500">{c.businessNo}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">차이 없음</p>
                  )}
                </li>
              ))}
            </ul>
          ) : periodCompare.changedClients.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {periodCompare.changedClients.map(c => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-slate-700">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.change === 'added' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {c.change === 'added' ? '추가' : '제외'}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{c.companyName}</span>
                  {c.businessNo && (
                    <span className="text-sm text-slate-500 tabular-nums">{c.businessNo}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">이전 기간과 대상 구성이 동일합니다.</p>
          )}
        </div>
      )}

      {footer}

      {diffHint && (
        <p className="mb-4 text-xs text-rose-500">{diffHint}</p>
      )}
    </>
  );
}
