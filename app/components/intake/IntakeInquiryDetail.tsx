'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConsultationFormConfig } from '../../types/consultation';
import { getDisplayPhaseColumns, isFieldVisible } from '../../types/consultation';
import { formatIntakeDate } from '../../utils/intakeDates';
import { allFormKeys, applyConsultationLinks } from '@/lib/consultationFormLinks';
import BlueholeRegisterCopyButton from './BlueholeRegisterCopyButton';
import ConsultationPhaseGrid, {
  CONSULT_MULTI_VALUE_DELIM,
  splitConsultMultiValue,
} from './ConsultationPhaseGrid';
import {
  inquiryFormFields,
  inquiryRepPhone,
  inquiryAdmin,
  inquiryAdminPhone,
  inquiryEmail,
  inquiryConsultTypes,
  type InquiryRow,
} from './intakeUtils';
import { fmt } from '@/app/lib/taxAmountFmt';

function rowFromApi(inquiry: Record<string, unknown>): InquiryRow {
  return {
    id: String(inquiry.id),
    clientId: inquiry.clientId != null ? String(inquiry.clientId) : null,
    companyName: String(inquiry.companyName ?? ''),
    phone: String(inquiry.phone ?? ''),
    channel: String(inquiry.channel ?? ''),
    consultant: String(inquiry.consultant ?? ''),
    inquiryDate: formatIntakeDate(String(inquiry.inquiryDate ?? '')),
    inquiryContent: String(inquiry.inquiryContent ?? ''),
    contractStatus: String(inquiry.contractStatus ?? ''),
    proposedFee: typeof inquiry.proposedFee === 'number' ? inquiry.proposedFee : null,
    industry: String(inquiry.industry ?? ''),
    businessNo: String(inquiry.businessNo ?? ''),
    representative: String(inquiry.representative ?? ''),
    address: String(inquiry.address ?? ''),
    extra: (inquiry.extra && typeof inquiry.extra === 'object' ? inquiry.extra : {}) as Record<string, unknown>,
    createdAt: inquiry.createdAt != null ? String(inquiry.createdAt) : '',
  };
}

function formDataToStrings(form: Record<string, unknown> | null): Record<string, string> {
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    if (Array.isArray(v)) {
      const joined = v.map(x => String(x).trim()).filter(Boolean).join(CONSULT_MULTI_VALUE_DELIM);
      if (joined) out[k] = joined;
      continue;
    }
    if (v != null && String(v).trim() !== '') out[k] = String(v);
  }
  return out;
}

function mergeConsultationForm(
  config: ConsultationFormConfig | null,
  inquiry: InquiryRow,
): Record<string, string> {
  const saved = formDataToStrings(inquiryFormFields(inquiry.extra));
  const init: Record<string, string> = {};
  if (config) {
    for (const key of allFormKeys(config)) init[key] = '';
  }
  for (const [k, v] of Object.entries(saved)) init[k] = v;
  if (!init.companyName) init.companyName = inquiry.companyName || '';
  if (!init.phone) init.phone = inquiry.phone || '';
  if (!init.channel) init.channel = inquiry.channel || '';
  if (!init.representative) init.representative = inquiry.representative || '';
  if (!init.industry) init.industry = inquiry.industry || '';
  if (!init.businessNo) init.businessNo = inquiry.businessNo || '';
  if (!init.location) init.location = inquiry.address || '';
  if (!init.proposedFee && inquiry.proposedFee != null) {
    init.proposedFee = fmt(String(inquiry.proposedFee));
  } else if (init.proposedFee) {
    init.proposedFee = fmt(init.proposedFee);
  }
  return applyConsultationLinks(init);
}

function MetaGrid({ items, compact }: { items: { label: string; value: string }[]; compact?: boolean }) {
  const visible = items.filter(i => i.value);
  if (!visible.length) return null;
  return (
    <dl className={`grid gap-x-3 gap-y-1.5 ${compact ? 'grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {visible.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-[10px] font-bold text-gray-500 uppercase leading-none">{label}</dt>
          <dd className={`text-gray-900 mt-0.5 leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FormFieldsSection({
  form,
  config,
}: {
  form: Record<string, unknown>;
  config: ConsultationFormConfig | null;
}) {
  const columns = useMemo(() => {
    if (!config) return null;
    const strings = formDataToStrings(form);
    return getDisplayPhaseColumns(config)
      .filter(col => col.phaseId === 'phone')
      .map(col => ({
        ...col,
        steps: col.steps
          .map(step => ({
            ...step,
            fields: step.fields.filter(f => {
              if (!isFieldVisible(f, strings)) return false;
              const raw = form[f.key];
              if (raw == null) return false;
              if (Array.isArray(raw)) return raw.some(v => String(v).trim());
              return String(raw).trim() !== '';
            }),
          }))
          .filter(step => step.fields.length > 0),
      }))
      .filter(col => col.steps.length > 0);
  }, [form, config]);

  if (columns?.length) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase">전화 상담</p>
        <div className="rounded-xl border border-blue-100 bg-white p-3 space-y-3">
          {columns[0].steps.map(step => (
            <section key={step.id} className="space-y-2">
              <h4 className="text-[11px] font-bold text-slate-800">{step.title}</h4>
              <dl className="space-y-2 text-sm">
                {step.fields.map(f => {
                  const raw = form[f.key];
                  const value = Array.isArray(raw)
                    ? raw.map(v => String(v)).filter(Boolean).join(', ')
                    : String(raw ?? '');
                  return (
                    <div key={f.key} className="border-l-2 border-blue-100 pl-3">
                      <dt className="text-xs font-semibold text-gray-500">{f.label}</dt>
                      <dd className="text-gray-800 whitespace-pre-line mt-0.5">{value}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      </div>
    );
  }

  const labeled = Object.entries(form)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([key, value]) => ({ label: key, value: String(value) }));
  if (!labeled.length) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">신규상담 상세</p>
      <dl className="space-y-2 text-sm">
        {labeled.map(({ label, value }) => (
          <div key={label} className="border-l-2 border-blue-100 pl-3">
            <dt className="text-xs font-semibold text-gray-500">{label}</dt>
            <dd className="text-gray-800 whitespace-pre-line mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TextBlock({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">{label}</p>
      <p className={`text-gray-800 whitespace-pre-line leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  );
}

export default function IntakeInquiryDetail({
  inquiry,
  onUpdated,
  compact = false,
}: {
  inquiry: InquiryRow;
  onUpdated: (row: InquiryRow) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [consultationForm, setConsultationForm] = useState<Record<string, string>>({});
  const [formConfig, setFormConfig] = useState<ConsultationFormConfig | null>(null);

  useEffect(() => {
    setEditing(false);
    setError('');
  }, [inquiry.id]);

  useEffect(() => {
    if (editing) return;
    setConsultationForm(mergeConsultationForm(formConfig, inquiry));
  }, [inquiry, formConfig, editing]);

  useEffect(() => {
    void fetch('/data/new-consultation-form.json')
      .then(r => r.json())
      .then((c: ConsultationFormConfig) => setFormConfig(c))
      .catch(() => {});
  }, []);

  const formData = inquiryFormFields(inquiry.extra);

  const metaItems = [
    { label: '문의유형', value: inquiryConsultTypes(inquiry.extra).join(', ') },
    { label: '문의일', value: inquiry.inquiryDate },
    { label: '유입', value: inquiry.channel },
    { label: '상담자', value: inquiry.consultant },
    { label: '연락처', value: inquiry.phone },
    { label: '업종', value: inquiry.industry },
    { label: '사업자번호', value: inquiry.businessNo },
    { label: '대표자', value: inquiry.representative },
    { label: '대표 연락처', value: inquiryRepPhone(inquiry.extra) },
    { label: '관리자', value: inquiryAdmin(inquiry.extra) },
    { label: '관리자 연락처', value: inquiryAdminPhone(inquiry.extra) },
    { label: '주소', value: inquiry.address },
    { label: '이메일', value: inquiryEmail(inquiry.extra) },
    { label: '계약 상태', value: inquiry.contractStatus },
    { label: '제안료', value: inquiry.proposedFee != null ? `${inquiry.proposedFee.toLocaleString()}원` : '' },
  ];

  const onConsultationChange = (key: string, value: string) => {
    setConsultationForm(prev => applyConsultationLinks({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const linked = applyConsultationLinks(consultationForm);
      const proposedFeeRaw = (linked.proposedFee ?? '').trim().replace(/,/g, '');
      const proposedFee = proposedFeeRaw ? Number(proposedFeeRaw) : null;
      const channel = [linked.channel, linked.channelDetail].filter(v => v?.trim()).join(' · ')
        || inquiry.channel;
      const res = await fetch(`/api/intake/inquiries/${inquiry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: (linked.companyName ?? '').trim() || inquiry.companyName,
          phone: (linked.phone ?? '').trim() || inquiry.phone,
          channel,
          proposedFee: proposedFee != null && !Number.isNaN(proposedFee) ? proposedFee : null,
          industry: (linked.industry ?? '').trim(),
          businessNo: (linked.businessNo ?? '').trim(),
          representative: (linked.representative ?? '').trim(),
          address: (linked.location ?? '').trim() || inquiry.address,
          extra: {
            form: Object.fromEntries(
              Object.entries(linked).map(([key, value]) => [
                key,
                key === 'consultTypes' ? splitConsultMultiValue(value) : value,
              ]),
            ),
          },
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      const updated = rowFromApi(data.inquiry);
      onUpdated(updated);
      setConsultationForm(mergeConsultationForm(formConfig, updated));
      setEditing(false);
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-blue-600">전화 상담 수정</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConsultationForm(mergeConsultationForm(formConfig, inquiry));
                setEditing(false);
                setError('');
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {formConfig ? (
          <ConsultationPhaseGrid
            config={formConfig}
            form={consultationForm}
            onChange={onConsultationChange}
            mode="phone"
          />
        ) : (
          <p className="text-sm text-gray-400">상담 양식을 불러오는 중…</p>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      <div className="flex items-center justify-end -mt-1">
        <button
          type="button"
          onClick={() => {
            setConsultationForm(mergeConsultationForm(formConfig, inquiry));
            setEditing(true);
          }}
          className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 font-semibold hover:bg-white hover:border-blue-300"
        >
          신규상담·상세 수정
        </button>
      </div>
      <MetaGrid items={metaItems} compact={compact} />
      <div className="flex flex-wrap items-center gap-2">
        <BlueholeRegisterCopyButton inquiry={inquiry} />
      </div>
      <TextBlock label="문의·상담 내용" value={inquiry.inquiryContent} compact={compact} />
      {formData && <FormFieldsSection form={formData} config={formConfig} />}
      {!inquiry.inquiryContent && !formData && (
        <p className="text-sm text-gray-400">등록된 상세 내용이 없습니다. 수정 버튼으로 입력할 수 있습니다.</p>
      )}
    </div>
  );
}
