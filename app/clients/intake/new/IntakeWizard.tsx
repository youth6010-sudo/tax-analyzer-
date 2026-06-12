'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '../../../components/AppHeader';
import type { IntakeField, IntakeManual } from '../../../types/intake';
import type { ClientRecord } from '../../../types/client';
import type { BusinessEntityType } from '../../../types/contact';
import { BUSINESS_ENTITY_TYPES } from '../../../types/contact';

type IntakeForm = Record<string, unknown>;

const CONTACT_KEYS = new Set([
  'companyName', 'representative', 'phone', 'fax', 'businessEntityType',
  'businessNo', 'corporateNo', 'residentNo', 'serviceTypes', 'taxTypes',
]);

function emptyForm(): IntakeForm {
  return {
    companyName: '',
    representative: '',
    phone: '',
    fax: '',
    businessEntityType: '',
    businessNo: '',
    corporateNo: '',
    residentNo: '',
    serviceTypes: [],
    taxTypes: [],
  };
}

function clientToForm(c: ClientRecord): IntakeForm {
  return {
    ...emptyForm(),
    ...c.intakeData,
    companyName: c.companyName === '(유입 진행중)' ? '' : c.companyName,
    representative: c.representative,
    phone: c.phone,
    fax: c.fax,
    businessEntityType: c.businessEntityType,
    businessNo: c.businessNo,
    corporateNo: c.corporateNo,
    residentNo: c.residentNo,
    serviceTypes: [...c.serviceTypes],
    taxTypes: [...c.taxTypes],
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === 'entity') {
    return (
      <div className="flex flex-wrap gap-2">
        {BUSINESS_ENTITY_TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${
              value === t.id ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === 'checklist') {
    const checked = value === true || value === 'O';
    return (
      <label className="flex items-center gap-2 py-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-sm text-gray-800">{field.label}</span>
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={str(value)}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={str(value)}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
      >
        {(field.options ?? []).map(opt => (
          <option key={opt} value={opt}>{opt || '선택…'}</option>
        ))}
      </select>
    );
  }

  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <input
      type={inputType}
      value={str(value)}
      onChange={e => onChange(field.type === 'number' ? e.target.value : e.target.value)}
      className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
    />
  );
}

export default function IntakeWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get('id');

  const [manual, setManual] = useState<IntakeManual | null>(null);
  const [clientId, setClientId] = useState<string | null>(resumeId);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/intake-manual.json')
      .then(r => r.json())
      .then(setManual)
      .catch(() => setError('유입 설정을 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!resumeId) {
      fetch('/api/clients/intake', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.client) {
            setClientId(data.client.id);
            setStep(data.client.intakeStep ?? 0);
            setForm(clientToForm(data.client));
          }
        })
        .catch(() => setError('유입을 시작하지 못했습니다.'));
      return;
    }

    fetch(`/api/clients/${resumeId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.client) {
          setClientId(data.client.id);
          setStep(data.client.intakeStep ?? 0);
          setForm(clientToForm(data.client));
        }
      });
  }, [resumeId]);

  const steps = manual?.steps ?? [];
  const current = steps[step];
  const isConfirm = current?.id === 'confirm';

  const patchPayload = useMemo(
    () => ({
      companyName: str(form.companyName).trim() || '(유입 진행중)',
      representative: str(form.representative).trim(),
      phone: str(form.phone).trim(),
      fax: str(form.fax).trim(),
      businessEntityType: (str(form.businessEntityType) || '') as BusinessEntityType | '',
      businessNo: str(form.businessNo).trim(),
      corporateNo: str(form.corporateNo).trim(),
      residentNo: str(form.residentNo).trim(),
      serviceTypes: Array.isArray(form.serviceTypes) ? form.serviceTypes : [],
      taxTypes: Array.isArray(form.taxTypes) ? form.taxTypes : [],
    }),
    [form],
  );

  const saveStep = useCallback(
    async (nextStep: number) => {
      if (!clientId) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/clients/${clientId}/intake`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intakeStep: nextStep,
            intakeData: form,
            patch: patchPayload,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? '저장 실패');
        }
        setStep(nextStep);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [clientId, form, patchPayload],
  );

  const validateStep = (): string | null => {
    if (!current) return null;
    for (const field of current.fields) {
      if (!field.required) continue;
      const v = form[field.key];
      if (field.type === 'checklist') continue;
      if (v == null || str(v).trim() === '') return `${field.label}을(를) 입력해 주세요.`;
    }
    return null;
  };

  const handleNext = async () => {
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    if (step < steps.length - 1) await saveStep(step + 1);
  };

  const handleComplete = async () => {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    try {
      await fetch(`/api/clients/${clientId}/intake`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeStep: step, intakeData: form, patch: patchPayload }),
      });
      const res = await fetch(`/api/clients/${clientId}/intake`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '완료 처리 실패');
      router.push(`/clients/${clientId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '완료하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  if (!manual) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <AppHeader />
        <main className="flex-1 flex items-center justify-center text-sm text-gray-400">불러오는 중…</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-black text-gray-900">신규 유입</h1>
        <p className="text-sm text-gray-600 mt-1">
          단계 {step + 1} / {steps.length} · {current?.title}
        </p>

        <div className="mt-4 flex gap-1">
          {steps.map((s, i) => (
            <div key={s.id} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <p className="text-sm text-gray-600">{current?.description}</p>

          {isConfirm ? (
            <dl className="text-sm space-y-2">
              <div><dt className="text-gray-400 text-xs">업체명</dt><dd className="font-semibold">{str(form.companyName)}</dd></div>
              <div><dt className="text-gray-400 text-xs">대표</dt><dd>{str(form.representative) || '-'}</dd></div>
              <div><dt className="text-gray-400 text-xs">전화</dt><dd>{str(form.phone) || '-'}</dd></div>
              {current.fields.length === 0 && steps
                .flatMap(s => s.fields)
                .filter(f => f.type === 'checklist')
                .map(f => (
                  <div key={f.key}>
                    <dt className="text-gray-400 text-xs">{f.label}</dt>
                    <dd>{form[f.key] ? '완료' : '미완료'}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            current?.fields.map(field => (
              <label key={field.key} className="block">
                {field.type !== 'checklist' && (
                  <span className="text-xs font-bold text-gray-500">
                    {field.label}{field.required ? ' *' : ''}
                  </span>
                )}
                <FieldInput
                  field={field}
                  value={form[field.key]}
                  onChange={v => setField(field.key, v)}
                />
              </label>
            ))
          )}
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <button
            type="button"
            disabled={step === 0 || saving}
            onClick={() => setStep(s => Math.max(0, s - 1))}
            className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl disabled:opacity-40"
          >
            이전
          </button>
          {isConfirm ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleComplete()}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '처리 중…' : '유입 완료'}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleNext()}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '다음'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
