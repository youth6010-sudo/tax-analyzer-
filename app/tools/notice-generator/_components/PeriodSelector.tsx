import type { ReactNode } from 'react';
import {
  TAX_TYPES,
  VAT_PERIODS,
  CORPORATE_FY_END_MONTHS,
  INCOME_FILING_TYPES,
} from '../_lib/taxTypes';
import { SELECTABLE_YEARS } from '../_lib/holidays';
import type { DeadlineParams, TaxTypeKey } from '../_lib/types';

const selectClass =
  'w-full rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100';

const labelClass = 'mb-1 block text-xs font-medium text-slate-500';

// 2026년부터 10년 범위
const YEAR_OPTIONS = SELECTABLE_YEARS;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

type Props = {
  taxType: TaxTypeKey;
  params: DeadlineParams;
  onChange: (key: keyof DeadlineParams, value: string | number) => void;
};

export default function PeriodSelector({ taxType, params, onChange }: Props) {
  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(244,114,182,0.35)] backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-200 text-sm">
          📅
        </span>
        신고 기간 선택
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* 공통: 연도 */}
        <Field label={taxType === TAX_TYPES.INCOME ? '귀속 연도' : '기준 연도'}>
          <select
            className={selectClass}
            value={params.year}
            onChange={e => onChange('year', Number(e.target.value))}
          >
            {YEAR_OPTIONS.map(y => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </Field>

        {/* 원천세: 귀속 월 */}
        {taxType === TAX_TYPES.WITHHOLDING && (
          <Field label="귀속 월">
            <select
              className={selectClass}
              value={params.month}
              onChange={e => onChange('month', Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* 부가세: 과세기간 */}
        {taxType === TAX_TYPES.VAT && (
          <Field label="과세기간">
            <select
              className={selectClass}
              value={params.vatPeriodId}
              onChange={e => onChange('vatPeriodId', e.target.value)}
            >
              {VAT_PERIODS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* 법인세: 결산월 */}
        {taxType === TAX_TYPES.CORPORATE && (
          <Field label="사업연도 종료(결산)월">
            <select
              className={selectClass}
              value={params.fyEndMonth}
              onChange={e => onChange('fyEndMonth', Number(e.target.value))}
            >
              {CORPORATE_FY_END_MONTHS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* 종소세: 신고 유형 */}
        {taxType === TAX_TYPES.INCOME && (
          <Field label="신고 유형">
            <select
              className={selectClass}
              value={params.filingTypeId}
              onChange={e => onChange('filingTypeId', e.target.value)}
            >
              {INCOME_FILING_TYPES.map(f => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </section>
  );
}
