'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type {
  BusinessEntityType,
  ContactRecord,
  ContactUpdatePayload,
  ServiceType,
} from '../types/contact';
import {
  BUSINESS_ENTITY_LABEL,
  BUSINESS_ENTITY_TYPES,
  EDITABLE_FIELDS,
  SERVICE_TYPE_LABEL,
  SERVICE_TYPES,
} from '../types/contact';
import { TAX_TYPES } from '../config/taxTypes';
import type { TaxTypeId } from '../config/taxTypes';
import BackButton from './BackButton';

const TAX_LABEL: Record<string, string> = Object.fromEntries(
  TAX_TYPES.map(t => [t.id, t.label]),
);

interface ContactDetailViewProps {
  contact: ContactRecord;
}

function toFormState(contact: ContactRecord): ContactUpdatePayload {
  return {
    companyName: contact.companyName,
    manager: contact.manager,
    representative: contact.representative,
    businessNo: contact.businessNo,
    corporateNo: contact.corporateNo,
    residentNo: contact.residentNo,
    phone: contact.phone,
    mobilePhone: contact.mobilePhone,
    fax: contact.fax,
    taxTypes: [...contact.taxTypes],
    businessEntityType: contact.businessEntityType,
    serviceTypes: [...contact.serviceTypes],
  };
}

function displayValue(value: string): string {
  const s = value.trim();
  return s || '-';
}

function CategorySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
      {children}
    </div>
  );
}

export default function ContactDetailView({ contact: initial }: ContactDetailViewProps) {
  const router = useRouter();
  const [contact, setContact] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContactUpdatePayload>(() => toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = useCallback(() => {
    setForm(toFormState(contact));
    setError(null);
    setEditing(true);
  }, [contact]);

  const cancelEdit = useCallback(() => {
    setForm(toFormState(contact));
    setError(null);
    setEditing(false);
  }, [contact]);

  const updateField = useCallback((key: keyof ContactUpdatePayload, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleTaxType = useCallback((id: TaxTypeId) => {
    setForm(prev => ({
      ...prev,
      taxTypes: prev.taxTypes.includes(id)
        ? prev.taxTypes.filter(t => t !== id)
        : [...prev.taxTypes, id],
    }));
  }, []);

  const setBusinessEntityType = useCallback((id: BusinessEntityType) => {
    setForm(prev => ({
      ...prev,
      businessEntityType: prev.businessEntityType === id ? '' : id,
    }));
  }, []);

  const toggleServiceType = useCallback((id: ServiceType) => {
    setForm(prev => ({
      ...prev,
      serviceTypes: prev.serviceTypes.includes(id)
        ? prev.serviceTypes.filter(t => t !== id)
        : [...prev.serviceTypes, id],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.companyName.trim()) {
      setError('업체명은 필수입니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setContact((data.contact ?? data.client) as ContactRecord);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [contact.id, form, router]);

  const handleDelete = useCallback(async () => {
    if (
      !confirm(
        `"${contact.companyName}" 수임처를 삭제할까요?\n연결된 시트·이력 데이터는 연결만 해제됩니다. 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${contact.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '삭제 실패');
      router.push('/clients');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    } finally {
      setDeleting(false);
    }
  }, [contact.companyName, contact.id, router]);

  const viewFields = EDITABLE_FIELDS.filter(
    f => f.key !== 'companyName',
  );

  return (
    <main className="flex-1 bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <BackButton />
          {!editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="px-4 py-2 text-sm font-bold text-red-700 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? '삭제 중…' : '삭제'}
              </button>
              <button
                type="button"
                onClick={startEdit}
                disabled={deleting}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
              >
                수정
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <article className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-5 bg-blue-50 border-b border-blue-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">거래처</p>
            {editing ? (
              <input
                type="text"
                value={form.companyName}
                onChange={e => updateField('companyName', e.target.value)}
                className="w-full text-xl font-black text-gray-900 leading-snug border border-blue-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="업체명(상호)"
              />
            ) : (
              <h1 className="text-2xl font-black text-gray-900 leading-snug">{contact.companyName}</h1>
            )}

            <CategorySection title="기업구분">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_ENTITY_TYPES.map(t => {
                    const checked = form.businessEntityType === t.id;
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="businessEntityType"
                          checked={checked}
                          onChange={() => setBusinessEntityType(t.id)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contact.businessEntityType ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                      {BUSINESS_ENTITY_LABEL[contact.businessEntityType]}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
              )}
            </CategorySection>

            <CategorySection title="서비스 유형">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {SERVICE_TYPES.map(t => {
                    const checked = form.serviceTypes.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleServiceType(t.id)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contact.serviceTypes.length > 0 ? (
                    contact.serviceTypes.map(t => (
                      <span key={t} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800">
                        {SERVICE_TYPE_LABEL[t]}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
              )}
            </CategorySection>

            <CategorySection title="세목">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {TAX_TYPES.map(t => {
                    const checked = form.taxTypes.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTaxType(t.id)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contact.taxTypes.length > 0 ? (
                    contact.taxTypes.map(t => (
                      <span key={t} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800">
                        {TAX_LABEL[t] ?? t}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
              )}
            </CategorySection>
          </div>

          <div className="p-5 grid gap-3 sm:grid-cols-2">
            {viewFields.map(({ key, label, mono }) => (
              <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
                {editing ? (
                  <input
                    type="text"
                    value={form[key] as string}
                    onChange={e => updateField(key, e.target.value)}
                    className={`w-full text-base font-semibold text-gray-900 border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${mono ? 'font-mono' : ''}`}
                  />
                ) : (
                  <p className={`text-base font-semibold text-gray-900 break-all ${mono ? 'font-mono' : ''}`}>
                    {displayValue(contact[key] as string)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
