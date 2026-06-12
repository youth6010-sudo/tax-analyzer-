'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DOUZONE_FIELD_LABELS,
  DOUZONE_NOTE_LABELS,
  DOUZONE_TAX_FLAG_LABELS,
} from '@/app/config/douzoneFields';

type FieldDef = { key: string; label: string; group: 'meta' | 'data' | 'note' | 'flag' };

function buildFieldDefs(intakeData: Record<string, unknown>): FieldDef[] {
  const defs: FieldDef[] = [
    { key: '__feeSummary', label: '기장료', group: 'meta' },
    { key: '__program', label: '프로그램', group: 'meta' },
  ];

  for (const key of Object.keys(DOUZONE_FIELD_LABELS)) {
    if (key === 'mobilePhone') continue;
    defs.push({ key, label: DOUZONE_FIELD_LABELS[key], group: 'data' });
  }

  for (const key of Object.keys(DOUZONE_NOTE_LABELS)) {
    defs.push({ key: `note:${key}`, label: DOUZONE_NOTE_LABELS[key], group: 'note' });
  }

  for (const key of Object.keys(DOUZONE_TAX_FLAG_LABELS)) {
    defs.push({ key: `flag:${key}`, label: DOUZONE_TAX_FLAG_LABELS[key], group: 'flag' });
  }

  // 기존 데이터에만 있는 키
  for (const key of Object.keys(intakeData)) {
    if (key === 'notes' || key === 'taxFlags' || key === 'mobilePhone') continue;
    if (!defs.some(d => d.key === key)) {
      defs.push({ key, label: key, group: 'data' });
    }
  }

  return defs;
}

function toFormState(
  intakeData: Record<string, unknown>,
  feeSummary: number | null,
  program: string,
): Record<string, string> {
  const form: Record<string, string> = {
    __feeSummary: feeSummary != null ? String(feeSummary) : '',
    __program: program ?? '',
  };

  for (const [key, value] of Object.entries(intakeData)) {
    if (key === 'notes' || key === 'taxFlags' || key === 'mobilePhone') continue;
    if (value != null && String(value).trim()) form[key] = String(value);
  }

  const notes = intakeData.notes;
  if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
    for (const [k, v] of Object.entries(notes as Record<string, unknown>)) {
      if (v != null && String(v).trim()) form[`note:${k}`] = String(v);
    }
  }

  const flags = intakeData.taxFlags;
  if (flags && typeof flags === 'object' && !Array.isArray(flags)) {
    for (const [k, v] of Object.entries(flags as Record<string, unknown>)) {
      if (v === true) form[`flag:${k}`] = 'Y';
    }
  }

  return form;
}

function fromFormState(form: Record<string, string>, prev: Record<string, unknown>): Record<string, unknown> {
  const intakeData: Record<string, unknown> = { ...(prev ?? {}) };
  const notes: Record<string, string> = { ...(typeof prev.notes === 'object' && prev.notes ? prev.notes as Record<string, string> : {}) };
  const taxFlags: Record<string, boolean> = { ...(typeof prev.taxFlags === 'object' && prev.taxFlags ? prev.taxFlags as Record<string, boolean> : {}) };

  for (const [key, value] of Object.entries(form)) {
    if (key === '__feeSummary' || key === '__program') continue;
    const v = value.trim();
    if (key.startsWith('note:')) {
      const nk = key.slice(5);
      if (v) notes[nk] = v; else delete notes[nk];
    } else if (key.startsWith('flag:')) {
      const fk = key.slice(5);
      taxFlags[fk] = v.toUpperCase() === 'Y';
    } else if (v) {
      intakeData[key] = v;
    } else {
      delete intakeData[key];
    }
  }

  if (Object.keys(notes).length) intakeData.notes = notes;
  else delete intakeData.notes;

  if (Object.keys(taxFlags).some(k => taxFlags[k])) intakeData.taxFlags = taxFlags;
  else delete intakeData.taxFlags;

  if (typeof prev.mobilePhone === 'string') intakeData.mobilePhone = prev.mobilePhone;

  return intakeData;
}

const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none';

export default function ClientDouzoneSection({
  clientId,
  intakeData: initialIntake,
  feeSummary: initialFee,
  program: initialProgram,
}: {
  clientId: string;
  intakeData: Record<string, unknown>;
  feeSummary: number | null;
  program: string;
}) {
  const router = useRouter();
  const [intakeData, setIntakeData] = useState(initialIntake);
  const [feeSummary, setFeeSummary] = useState(initialFee);
  const [program, setProgram] = useState(initialProgram);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => toFormState(initialIntake, initialFee, initialProgram));

  const fieldDefs = useMemo(() => buildFieldDefs(intakeData), [intakeData]);

  const displayEntries = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    if (feeSummary != null && feeSummary > 0) rows.push({ label: '기장료', value: feeSummary.toLocaleString() });
    if (program.trim()) rows.push({ label: '프로그램', value: program });

    for (const { key, label } of fieldDefs) {
      if (key.startsWith('__')) continue;
      let value = '';
      if (key.startsWith('note:')) {
        const notes = intakeData.notes as Record<string, string> | undefined;
        value = notes?.[key.slice(5)] ?? '';
      } else if (key.startsWith('flag:')) {
        const flags = intakeData.taxFlags as Record<string, boolean> | undefined;
        value = flags?.[key.slice(5)] ? 'Y' : '';
      } else {
        value = String(intakeData[key] ?? '');
      }
      if (value.trim()) rows.push({ label, value });
    }
    return rows;
  }, [fieldDefs, intakeData, feeSummary, program]);

  const startEdit = useCallback(() => {
    setForm(toFormState(intakeData, feeSummary, program));
    setError('');
    setEditing(true);
  }, [intakeData, feeSummary, program]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const feeRaw = form.__feeSummary?.trim().replace(/,/g, '') ?? '';
      const fee = feeRaw ? Number(feeRaw) : null;
      const nextIntake = fromFormState(form, intakeData);
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intakeData: nextIntake,
          feeSummary: fee != null && !Number.isNaN(fee) ? fee : null,
          program: form.__program?.trim() ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      const c = data.client;
      setIntakeData(c.intakeData ?? nextIntake);
      setFeeSummary(c.feeSummary ?? null);
      setProgram(c.program ?? '');
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-gray-800">상세내용</h2>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 font-semibold text-gray-700 hover:bg-white"
          >
            수정
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setError(''); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
            >
              취소
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="px-5 pt-3 text-xs text-red-600">{error}</p>}

      {editing ? (
        <div className="p-5 grid gap-3 sm:grid-cols-2">
          {fieldDefs.map(({ key, label, group }) => (
            <label key={key} className={`block text-xs ${group === 'note' ? 'sm:col-span-2' : ''}`}>
              <span className="font-semibold text-gray-600">{label}</span>
              {group === 'note' ? (
                <textarea
                  value={form[key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  rows={2}
                  className={inputCls}
                />
              ) : group === 'flag' ? (
                <select
                  value={form[key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">N</option>
                  <option value="Y">Y</option>
                </select>
              ) : (
                <input
                  value={form[key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className={inputCls}
                />
              )}
            </label>
          ))}
        </div>
      ) : displayEntries.length === 0 ? (
        <p className="p-5 text-sm text-gray-400">등록된 상세내용이 없습니다. 수정 버튼으로 입력할 수 있습니다.</p>
      ) : (
        <div className="p-5 grid gap-3 sm:grid-cols-2">
          {displayEntries.map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
              <p className="text-sm font-semibold text-gray-900 whitespace-pre-line break-all">{value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
