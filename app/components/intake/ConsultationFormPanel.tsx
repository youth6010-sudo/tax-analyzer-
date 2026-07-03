'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConsultationField, ConsultationFormConfig, ConsultationPhaseColumn } from '../../types/consultation';
import { getPhaseColumns, isFieldVisible } from '../../types/consultation';
import { allFormKeys, applyConsultationLinks, isPhoneSourceField, PHONE_SOURCE_KEYS } from '@/lib/consultationFormLinks';
import {
  buildBookkeepingConsultSheetText,
  formRecordToBookkeepingSource,
} from '@/lib/bookkeepingConsultCopy';
import BookkeepingConsultCopyButton from './BookkeepingConsultCopyButton';

type DraftSummary = {
  id: string;
  companyName: string;
  stepIdx: number;
  stepTitle: string;
  updatedAt: string;
};

const REGISTER_REQUIRED_KEYS = new Set(['phone', 'companyName']);

const PHASE_HEADER: Record<string, string> = {
  phone: 'from-blue-50 to-sky-50 border-blue-100',
  visit: 'from-indigo-50 to-violet-50 border-indigo-100',
  close: 'from-amber-50 to-orange-50 border-amber-100',
};

const PHASE_ACCENT: Record<string, string> = {
  phone: 'text-blue-700',
  visit: 'text-indigo-700',
  close: 'text-amber-800',
};

const PHONE_LINK_LABELS: Record<string, string> = {
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

function LinkedVisitSummary({ form }: { form: Record<string, string> }) {
  const items: { label: string; value: string }[] = [];
  if (form.recordMeetingAt?.trim()) items.push({ label: '상담 일시', value: form.recordMeetingAt.trim() });
  if (form.coreNeeds?.trim()) items.push({ label: '핵심 니즈', value: form.coreNeeds.trim() });
  if (form.proposedFee?.trim()) items.push({ label: '예상 수임료', value: form.proposedFee.trim() });
  if (form.serviceBasic?.trim()) items.push({ label: '기본 서비스', value: form.serviceBasic.trim() });

  if (!items.length) return null;

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 space-y-1.5">
      <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">대면 상담 연동</p>
      <dl className="space-y-1 text-[11px]">
        {items.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-indigo-600/90 font-semibold">{label}</dt>
            <dd className="text-slate-800 whitespace-pre-line break-words mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: ConsultationField; value: string; onChange: (v: string) => void }) {
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
  const phoneLinkAtBottom = column.phaseId === 'visit';
  const showVisitLink = column.phaseId === 'close';

  return (
    <article className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <header className={`shrink-0 border-b bg-gradient-to-r px-4 py-3 ${header}`}>
        <h3 className={`text-sm font-black ${accent}`}>{column.label}</h3>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-4 max-h-[min(72vh,calc(100dvh-14rem))]">
        {showPhoneLink && !phoneLinkAtBottom && <LinkedPhoneSummary form={form} />}
        {showVisitLink && <LinkedVisitSummary form={form} />}
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
              {fields.map(f => (
                <label key={f.key} className="block">
                  <span className="text-xs font-semibold text-gray-700">
                    {f.label}
                    {REGISTER_REQUIRED_KEYS.has(f.key) ? ' *' : ''}
                  </span>
                  <FieldRow field={f} value={form[f.key] ?? ''} onChange={v => onChange(f.key, v)} />
                </label>
              ))}
            </section>
          );
        })}
        {showPhoneLink && phoneLinkAtBottom && <LinkedPhoneSummary form={form} />}
      </div>
    </article>
  );
}

function emptyForm(config: ConsultationFormConfig): Record<string, string> {
  const init: Record<string, string> = {};
  for (const key of allFormKeys(config)) init[key] = '';
  return init;
}

function mergeForm(config: ConsultationFormConfig, saved: Record<string, unknown>): Record<string, string> {
  const init = emptyForm(config);
  for (const key of Object.keys(init)) {
    const v = saved[key];
    if (v != null) init[key] = String(v);
  }
  return applyConsultationLinks(init);
}

export default function ConsultationFormPanel({
  onSuccess,
  initialDraftId,
}: {
  onSuccess?: (result: { inquiryId: string; processId: string }) => void;
  initialDraftId?: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<ConsultationFormConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const phaseColumns = useMemo(() => (config ? getPhaseColumns(config) : []), [config]);
  const bookkeepingCopyText = useMemo(
    () => buildBookkeepingConsultSheetText(formRecordToBookkeepingSource(applyConsultationLinks(form))),
    [form],
  );

  const loadDrafts = useCallback(async () => {
    const res = await fetch('/api/consultation/drafts');
    if (!res.ok) return;
    const data = await res.json();
    setDrafts(data.items ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const configRes = await fetch('/data/new-consultation-form.json');
      const c = (await configRes.json()) as ConsultationFormConfig;
      if (cancelled) return;
      setConfig(c);

      await loadDrafts();

      const targetDraftId = initialDraftId ?? null;
      if (targetDraftId) {
        const draftRes = await fetch(`/api/consultation/drafts/${targetDraftId}`);
        if (draftRes.ok) {
          const draft = await draftRes.json();
          if (!cancelled) {
            setDraftId(String(draft.id));
            setForm(mergeForm(c, draft.form ?? {}));
          }
        } else if (!cancelled) {
          setForm(emptyForm(c));
        }
      } else if (!cancelled) {
        setForm(emptyForm(c));
      }

      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [initialDraftId, loadDrafts]);

  const onChange = useCallback((key: string, v: string) => {
    setForm(prev => applyConsultationLinks({ ...prev, [key]: v }));
    setDraftMsg(null);
  }, []);

  const buildPayload = (): Record<string, unknown> => {
    const linked = applyConsultationLinks(form);
    const payload: Record<string, unknown> = { ...linked };
    if (linked.proposedFee) payload.proposedFee = Number(linked.proposedFee);
    return payload;
  };

  const saveDraft = async () => {
    setDraftSaving(true);
    setError(null);
    setDraftMsg(null);
    try {
      const res = await fetch('/api/consultation/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: draftId ?? undefined,
          data: buildPayload(),
          stepIdx: 0,
          stepTitle: '3단계 통합',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setDraftId(String(data.inquiryId));
      setDraftMsg('중간 저장되었습니다. 나중에 이어서 작성할 수 있습니다.');
      await loadDrafts();
      if (!initialDraftId && data.inquiryId) {
        router.replace(`/clients/intake?tab=consultation&draft=${data.inquiryId}`, { scroll: false });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '중간 저장하지 못했습니다.');
    } finally {
      setDraftSaving(false);
    }
  };

  const resumeDraft = (id: string) => {
    router.push(`/clients/intake?tab=consultation&draft=${id}`);
  };

  const deleteDraft = async (id: string) => {
    if (!window.confirm('이 초안을 삭제할까요?')) return;
    const res = await fetch(`/api/consultation/drafts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('초안을 삭제하지 못했습니다.');
      return;
    }
    if (draftId === id) {
      setDraftId(null);
      if (config) setForm(emptyForm(config));
      router.replace('/clients/intake?tab=consultation', { scroll: false });
    }
    await loadDrafts();
  };

  const startNew = () => {
    if (config) setForm(emptyForm(config));
    setDraftId(null);
    setDraftMsg(null);
    setError(null);
    router.replace('/clients/intake?tab=consultation', { scroll: false });
  };

  const doSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: buildPayload(), draftId: draftId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      if (onSuccess) {
        onSuccess({ inquiryId: String(data.inquiryId), processId: String(data.processId) });
      } else {
        router.push(`/clients/intake?tab=intake&inquiry=${data.inquiryId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const registerNow = async () => {
    if (!form.phone?.trim()) {
      setError('연락처를 입력해 주세요.');
      return;
    }
    if (!form.companyName?.trim()) {
      setError('상호명을 입력해 주세요.');
      return;
    }
    await doSubmit();
  };

  const canRegister = Boolean(form.phone?.trim() && form.companyName?.trim());

  if (!config || !ready) {
    return <p className="text-sm text-gray-400 py-8 text-center">불러오는 중…</p>;
  }

  const busy = saving || draftSaving;

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900">{config.title}</h2>
          {config.subtitle && <p className="text-xs text-gray-500 mt-0.5">{config.subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftId && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              작성 중 (초안)
            </span>
          )}
          <BookkeepingConsultCopyButton text={bookkeepingCopyText} />
        </div>
      </div>

      {drafts.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-bold text-amber-900">저장된 초안</h3>
            <button
              type="button"
              onClick={startNew}
              className="text-[10px] font-semibold text-amber-800 hover:underline"
            >
              새 상담 시작
            </button>
          </div>
          <ul className="space-y-2">
            {drafts.map(d => (
              <li
                key={d.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  d.id === draftId ? 'border-amber-300 bg-white' : 'border-amber-100 bg-white/80'
                }`}
              >
                <span className="font-semibold text-gray-800 flex-1 min-w-[8rem]">
                  {d.companyName || '(상호 미입력)'}
                </span>
                <button
                  type="button"
                  onClick={() => resumeDraft(d.id)}
                  className="font-bold text-blue-600 hover:underline"
                >
                  이어 작성
                </button>
                <button
                  type="button"
                  onClick={() => void deleteDraft(d.id)}
                  className="text-gray-400 hover:text-red-600"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4 lg:items-stretch">
        {phaseColumns.map(col => (
          <PhaseColumn key={col.phaseId} column={col} form={form} onChange={onChange} />
        ))}
      </div>

      {draftMsg && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {draftMsg}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/clients/intake?tab=intake"
          className="px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={busy}
          className="px-4 py-2.5 text-sm font-semibold border border-amber-200 rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {draftSaving ? '저장 중…' : '중간 저장'}
        </button>
        <button
          type="button"
          onClick={() => void registerNow()}
          disabled={busy || !canRegister}
          title={!canRegister ? '연락처와 상호명을 입력하면 등록할 수 있어요' : undefined}
          className="flex-1 min-w-[10rem] py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '✓ 상담 등록'}
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-400">
        연락처·상호명 필수 · 초회상담자는 로그인 계정으로 자동 기록 · 나머지는 등록 후 보완
      </p>
    </div>
  );
}
