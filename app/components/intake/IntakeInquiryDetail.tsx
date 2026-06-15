'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConsultationFormConfig } from '../../types/consultation';
import BlueholeCaseLink from './BlueholeCaseLink';
import {
  inquiryBlueholeCase,
  inquiryFormFields,
  inquiryNote,
  inquiryRepPhone,
  inquiryAdmin,
  inquiryAdminPhone,
  inquiryEmail,
  type InquiryRow,
} from './intakeUtils';

type EditState = {
  companyName: string;
  phone: string;
  channel: string;
  consultant: string;
  inquiryDate: string;
  inquiryContent: string;
  contractStatus: string;
  proposedFee: string;
  industry: string;
  businessNo: string;
  representative: string;
  address: string;
  note: string;
  blueholeCase: string;
  repPhone: string;
  admin: string;
  adminPhone: string;
  email: string;
};

function toEditState(q: InquiryRow): EditState {
  return {
    companyName: q.companyName,
    phone: q.phone,
    channel: q.channel,
    consultant: q.consultant,
    inquiryDate: q.inquiryDate,
    inquiryContent: q.inquiryContent,
    contractStatus: q.contractStatus,
    proposedFee: q.proposedFee != null ? String(q.proposedFee) : '',
    industry: q.industry,
    businessNo: q.businessNo,
    representative: q.representative,
    address: q.address,
    note: inquiryNote(q.extra),
    blueholeCase: inquiryBlueholeCase(q.extra),
    repPhone: inquiryRepPhone(q.extra),
    admin: inquiryAdmin(q.extra),
    adminPhone: inquiryAdminPhone(q.extra),
    email: inquiryEmail(q.extra),
  };
}

function rowFromApi(inquiry: Record<string, unknown>): InquiryRow {
  return {
    id: String(inquiry.id),
    clientId: inquiry.clientId != null ? String(inquiry.clientId) : null,
    companyName: String(inquiry.companyName ?? ''),
    phone: String(inquiry.phone ?? ''),
    channel: String(inquiry.channel ?? ''),
    consultant: String(inquiry.consultant ?? ''),
    inquiryDate: String(inquiry.inquiryDate ?? ''),
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

function FormFieldsSection({ form, config }: { form: Record<string, unknown>; config: ConsultationFormConfig | null }) {
  const labeled = useMemo(() => {
    if (!config) {
      return Object.entries(form)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .map(([key, value]) => ({ label: key, value: String(value) }));
    }
    const labelMap = new Map<string, string>();
    for (const step of config.steps) {
      for (const f of step.fields) labelMap.set(f.key, f.label);
    }
    const skip = new Set(['companyName', 'phone', 'representative', 'industry', 'businessNo', 'proposedFee', 'location']);
    return Object.entries(form)
      .filter(([key, v]) => !skip.has(key) && v != null && String(v).trim() !== '')
      .map(([key, value]) => ({ label: labelMap.get(key) ?? key, value: String(value) }));
  }, [form, config]);

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

const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none';

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
  const [form, setForm] = useState<EditState>(() => toEditState(inquiry));
  const [formConfig, setFormConfig] = useState<ConsultationFormConfig | null>(null);

  useEffect(() => { setForm(toEditState(inquiry)); setEditing(false); }, [inquiry]);

  useEffect(() => {
    void fetch('/data/new-consultation-form.json')
      .then(r => r.json())
      .then(setFormConfig)
      .catch(() => {});
  }, []);

  const formData = inquiryFormFields(inquiry.extra);
  const note = inquiryNote(inquiry.extra);
  const bluehole = inquiryBlueholeCase(inquiry.extra);

  const metaItems = [
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

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const proposedFee = form.proposedFee.trim() ? Number(form.proposedFee.replace(/,/g, '')) : null;
      const res = await fetch(`/api/intake/inquiries/${inquiry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          phone: form.phone.trim(),
          channel: form.channel.trim(),
          consultant: form.consultant.trim(),
          inquiryDate: form.inquiryDate.trim(),
          inquiryContent: form.inquiryContent.trim(),
          contractStatus: form.contractStatus.trim(),
          proposedFee: proposedFee != null && !Number.isNaN(proposedFee) ? proposedFee : null,
          industry: form.industry.trim(),
          businessNo: form.businessNo.trim(),
          representative: form.representative.trim(),
          address: form.address.trim(),
          extra: {
            note: form.note.trim(),
            blueholeCase: form.blueholeCase.trim(),
            repPhone: form.repPhone.trim(),
            admin: form.admin.trim(),
            adminPhone: form.adminPhone.trim(),
            email: form.email.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      const updated = rowFromApi(data.inquiry);
      onUpdated(updated);
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
          <p className="text-xs font-bold text-blue-600">수정 중</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setForm(toEditState(inquiry)); setEditing(false); setError(''); }}
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
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['companyName', '상호'],
            ['inquiryDate', '문의일'],
            ['channel', '유입'],
            ['consultant', '상담자'],
            ['phone', '연락처'],
            ['representative', '대표자'],
            ['industry', '업종'],
            ['businessNo', '사업자번호'],
            ['repPhone', '대표 연락처'],
            ['admin', '관리자'],
            ['adminPhone', '관리자 연락처'],
            ['address', '주소'],
            ['email', '이메일'],
            ['contractStatus', '계약 상태'],
            ['proposedFee', '제안료'],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-xs">
              <span className="font-semibold text-gray-600">{label}</span>
              <input
                value={form[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className={inputCls}
              />
            </label>
          ))}
        </div>
        <label className="block text-xs">
          <span className="font-semibold text-gray-600">특이사항</span>
          <textarea
            value={form.note}
            onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
            rows={3}
            className={inputCls}
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-gray-600">블루홀 업체</span>
          <input
            value={form.blueholeCase}
            onChange={e => setForm(prev => ({ ...prev, blueholeCase: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-gray-600">문의·상담 내용</span>
          <textarea
            value={form.inquiryContent}
            onChange={e => setForm(prev => ({ ...prev, inquiryContent: e.target.value }))}
            rows={8}
            className={inputCls}
          />
        </label>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      <div className="flex items-center justify-end -mt-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 font-semibold hover:bg-white hover:border-blue-300"
        >
          수정
        </button>
      </div>
      <MetaGrid items={metaItems} compact={compact} />
      <TextBlock label="특이사항" value={note} compact={compact} />
      {bluehole.trim() ? (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">블루홀 업체</p>
          <BlueholeCaseLink value={bluehole} className="text-xs" />
        </div>
      ) : null}
      <TextBlock label="문의·상담 내용" value={inquiry.inquiryContent} compact={compact} />
      {formData && <FormFieldsSection form={formData} config={formConfig} />}
      {!note && !bluehole && !inquiry.inquiryContent && !formData && (
        <p className="text-sm text-gray-400">등록된 상세 내용이 없습니다. 수정 버튼으로 입력할 수 있습니다.</p>
      )}
    </div>
  );
}
