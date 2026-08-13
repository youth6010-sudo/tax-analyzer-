'use client';

import type { ConsultationField, ConsultationFormConfig, ConsultationPhaseColumn } from '@/app/types/consultation';
import { getDisplayPhaseColumns, isFieldVisible } from '@/app/types/consultation';
import { isPhoneSourceField, PHONE_SOURCE_KEYS } from '@/lib/consultationFormLinks';
import { fmt } from '@/app/lib/taxAmountFmt';

/** 금액 입력 — 천단위 쉼표 */
const MONEY_FIELD_KEYS = new Set(['proposedFee']);

export const CONSULT_REGISTER_REQUIRED_KEYS = new Set(['phone', 'companyName', 'consultTypes']);
export const CONSULT_MULTI_VALUE_DELIM = '\n';

const PHASE_HEADER: Record<string, string> = {
  phone: 'from-blue-50 to-sky-50 border-blue-100',
  visit: 'from-indigo-50 to-violet-50 border-indigo-100',
  close: 'from-amber-50 to-orange-50 border-amber-100',
  visitClose: 'from-indigo-50 to-amber-50 border-indigo-100',
};

const PHASE_ACCENT: Record<string, string> = {
  phone: 'text-blue-700',
  visit: 'text-indigo-700',
  close: 'text-amber-800',
  visitClose: 'text-indigo-800',
};

const PHONE_LINK_LABELS: Record<string, string> = {
  consultTypes: '문의 유형',
  phone: '연락처',
  companyName: '상호명',
  representative: '성함',
  openDate: '개업일',
  location: '사업장 위치',
  industry: '업종',
  revenue: '매출 규모',
  channel: '유입경로',
  channelDetail: '유입 상세',
  payrollFullTime: '상용직',
  payrollDaily: '일용직',
  payrollOther: '사업/기타',
  businessEntityType: '사업자 유형',
  vatTaxStatus: '과·면세',
  hasPrevAccountant: '이전 세무사',
  prevTerminated: '해지',
  prevDocsReturned: '자료 반환',
  prevUnpaidIssues: '미수·분쟁',
  prevComplaints: '이전 불만',
  clientNeeds: '고객 니즈',
  taxStatusSummary: '세무현황요약',
  potentialTaxIssues: '세무 이슈',
  proposedServiceScope: '서비스 범위',
  feeDirection: '수임료 방향',
  consultRemarks: '비고',
};

export function splitConsultMultiValue(value: string): string[] {
  return value
    .split(CONSULT_MULTI_VALUE_DELIM)
    .map(v => v.trim())
    .filter(Boolean);
}

export function toggleConsultMultiValue(value: string, option: string): string {
  const items = splitConsultMultiValue(value);
  return (items.includes(option) ? items.filter(v => v !== option) : [...items, option]).join(
    CONSULT_MULTI_VALUE_DELIM,
  );
}

export function isConsultRequiredFilled(key: string, value: string): boolean {
  if (key === 'consultTypes') return splitConsultMultiValue(value).length > 0;
  return Boolean(value.trim());
}

function LinkedPhoneSummary({ form }: { form: Record<string, string> }) {
  const items = PHONE_SOURCE_KEYS.map(key => ({
    key,
    label: PHONE_LINK_LABELS[key] ?? key,
    value: form[key]?.trim() ?? '',
  })).filter(i => i.value && !(i.key === 'hasPrevAccountant' && i.value === '없음'));

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 px-3 py-2.5 text-[11px] text-blue-700/80">
        전화 상담 열에서 입력한 내용이 여기에 연동됩니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 space-y-1.5">
      <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">전화 상담 연동</p>
      <dl className="grid grid-cols-1 gap-x-2 gap-y-1 text-[11px]">
        {items.map(({ key, label, value }) => (
          <div key={key} className="min-w-0">
            <dt className="text-blue-600/90 font-semibold inline">{label}</dt>
            <dd className="text-slate-800 whitespace-pre-line break-words mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ConsultationField;
  value: string;
  onChange: (v: string) => void;
}) {
  const base =
    'mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none';
  if (field.type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className={`${base} resize-y min-h-[2.5rem]`}
        placeholder={field.placeholder}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={base}>
        {(field.options ?? []).map(o => (
          <option key={o} value={o}>
            {o || '선택…'}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'multiselect') {
    const selected = new Set(splitConsultMultiValue(value));
    return (
      <div className="mt-1 space-y-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
        {(field.options ?? []).map(option => (
          <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => onChange(toggleConsultMultiValue(value, option))}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }
  if (field.type === 'number' && MONEY_FIELD_KEYS.has(field.key)) {
    return (
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(fmt(e.target.value))}
        className={base}
        placeholder={field.placeholder}
      />
    );
  }
  return (
    <input
      type={
        field.type === 'number'
          ? 'number'
          : field.type === 'date'
            ? 'date'
            : field.type === 'email'
              ? 'email'
              : 'text'
      }
      value={value}
      onChange={e => onChange(e.target.value)}
      className={base}
      placeholder={field.placeholder}
    />
  );
}

function PhaseColumn({
  column,
  form,
  onChange,
}: {
  column: ConsultationPhaseColumn;
  form: Record<string, string>;
  onChange: (key: string, v: string) => void;
}) {
  const header = PHASE_HEADER[column.phaseId] ?? 'from-slate-50 to-slate-100 border-slate-200';
  const accent = PHASE_ACCENT[column.phaseId] ?? 'text-slate-700';
  const showPhoneLink = column.phaseId !== 'phone';

  return (
    <article className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <header className={`shrink-0 border-b bg-gradient-to-r px-4 py-3 ${header}`}>
        <h3 className={`text-sm font-black ${accent}`}>{column.label}</h3>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-4 max-h-[min(72vh,calc(100dvh-14rem))]">
        {column.steps.map(step => {
          const fields = step.fields.filter(
            f => isFieldVisible(f, form) && !(showPhoneLink && isPhoneSourceField(f.key)),
          );
          if (!fields.length) return null;
          return (
            <section key={step.id} className="space-y-2.5">
              <div>
                <h4 className="text-xs font-bold text-slate-800">{step.title}</h4>
                {step.description && (
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{step.description}</p>
                )}
                {step.guide && (
                  <p className="mt-1 text-[11px] text-blue-800 bg-blue-50/80 rounded-md px-2 py-1.5 border-l-2 border-blue-300 leading-snug">
                    {step.guide}
                  </p>
                )}
              </div>
              {fields.map(f => {
                const required = Boolean(f.required || CONSULT_REGISTER_REQUIRED_KEYS.has(f.key));
                return (
                  <label key={f.key} className="block">
                    <span className={`text-xs font-semibold ${required ? 'text-rose-700' : 'text-gray-700'}`}>
                      {f.label}
                      {required && (
                        <span className="ml-0.5 font-bold text-rose-600" title="필수">
                          *
                        </span>
                      )}
                    </span>
                    <FieldRow field={f} value={form[f.key] ?? ''} onChange={v => onChange(f.key, v)} />
                  </label>
                );
              })}
            </section>
          );
        })}
        {showPhoneLink && <LinkedPhoneSummary form={form} />}
      </div>
    </article>
  );
}

export default function ConsultationPhaseGrid({
  config,
  form,
  onChange,
  mode = 'all',
}: {
  config: ConsultationFormConfig;
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** all: 전화+대면·마무리 2열 / phone: 전화 상담만 (유입상세 수정용) */
  mode?: 'all' | 'phone';
}) {
  const columns =
    mode === 'phone'
      ? getDisplayPhaseColumns(config).filter(c => c.phaseId === 'phone')
      : getDisplayPhaseColumns(config);
  const gridClass =
    mode === 'phone'
      ? 'grid grid-cols-1 gap-3'
      : 'grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 lg:items-stretch';
  return (
    <div className={gridClass}>
      {columns.map(col => (
        <PhaseColumn key={col.phaseId} column={col} form={form} onChange={onChange} />
      ))}
    </div>
  );
}
