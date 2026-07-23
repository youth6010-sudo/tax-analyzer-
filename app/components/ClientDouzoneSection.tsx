'use client';



import { useCallback, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

import { DOUZONE_FIELD_LABELS } from '@/app/config/douzoneFields';

import { detailLineEntries, DETAIL_SKIP_KEYS } from '@/lib/clientDouzoneLayout';

import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';



const inputCls =

  'mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white focus:border-blue-400 focus:outline-none';



function buildEditableKeys(intakeData: Record<string, unknown>): string[] {

  const keys = new Set<string>();

  for (const key of Object.keys(DOUZONE_FIELD_LABELS)) {

    if (!DETAIL_SKIP_KEYS.has(key)) keys.add(key);

  }

  for (const key of Object.keys(intakeData)) {

    if (!DETAIL_SKIP_KEYS.has(key) && !key.startsWith('__')) keys.add(key);

  }

  return [...keys];

}



export default function ClientDouzoneSection({

  clientId,

  intakeData: initialIntake,

  feeSummary: initialFee,

  program: initialProgram,

  canEdit = true,

  embedded = false,

}: {

  clientId: string;

  intakeData: Record<string, unknown>;

  feeSummary: number | null;

  program: string;

  canEdit?: boolean;

  embedded?: boolean;

}) {

  const router = useRouter();

  const [intakeData, setIntakeData] = useState(initialIntake);

  const [feeSummary, setFeeSummary] = useState(initialFee);

  const [program, setProgram] = useState(initialProgram);

  const [editing, setEditing] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const [form, setForm] = useState<Record<string, string>>(() =>

    toForm(initialIntake, initialFee, initialProgram),

  );



  const editableKeys = useMemo(() => buildEditableKeys(intakeData), [intakeData]);



  const lineEntries = useMemo(

    () => detailLineEntries(intakeData, { program, feeSummary }),

    [intakeData, program, feeSummary],

  );



  const startEdit = useCallback(() => {

    setForm(toForm(intakeData, feeSummary, program));

    setError('');

    setEditing(true);

  }, [intakeData, feeSummary, program]);



  const save = async () => {

    setSaving(true);

    setError('');

    try {

      const feeRaw = form.__feeSummary?.trim().replace(/,/g, '') ?? '';

      const fee = feeRaw ? Number(feeRaw) : null;

      const intakePatch: Record<string, unknown> = {};

      for (const key of editableKeys) {

        const v = form[key]?.trim() ?? '';

        intakePatch[key] = v || null;

      }

      const res = await fetch(`/api/clients/${clientId}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          intakeData: intakePatch,

          feeSummary: fee != null && !Number.isNaN(fee) ? fee : null,

          program: form.__program?.trim() ?? '',

        }),

      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? '저장 실패');

      const c = data.client;

      setIntakeData(c.intakeData ?? { ...intakeData, ...intakePatch });

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



  if (lineEntries.length === 0 && !canEdit) return null;



  return (

    <section className={embedded ? '' : 'border-t border-slate-200 pt-2'}>

      {!embedded && (
      <div className="mb-1 flex items-center justify-between gap-2">

        <h2 className="text-xs font-bold text-slate-600">상세정보</h2>

        {!canEdit ? null : !editing ? (

          <button type="button" onClick={startEdit} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>

            수정

          </button>

        ) : (

          <div className="flex gap-1.5">

            <button type="button" onClick={() => { setEditing(false); setError(''); }} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>취소</button>

            <button type="button" disabled={saving} onClick={() => void save()} className={`${portalBtnPrimary} !px-2 !py-0.5 !text-[10px]`}>{saving ? '저장…' : '저장'}</button>

          </div>

        )}

      </div>
      )}
      {embedded && canEdit && (
        <div className="mb-1 flex justify-end gap-1.5">
          {!editing ? (
            <button type="button" onClick={startEdit} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>수정</button>
          ) : (
            <>
              <button type="button" onClick={() => { setEditing(false); setError(''); }} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>취소</button>
              <button type="button" disabled={saving} onClick={() => void save()} className={`${portalBtnPrimary} !px-2 !py-0.5 !text-[10px]`}>{saving ? '저장…' : '저장'}</button>
            </>
          )}
        </div>
      )}

      {error && <p className="mb-1 text-[10px] text-red-600">{error}</p>}



      {editing ? (

        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">

          <label className="block text-[10px]">

            <span className="font-semibold text-slate-500">{CLIENT_FIELD_LABELS.fee}</span>

            <input value={form.__feeSummary ?? ''} onChange={e => setForm(p => ({ ...p, __feeSummary: e.target.value }))} className={inputCls} />

          </label>

          <label className="block text-[10px]">

            <span className="font-semibold text-slate-500">프로그램</span>

            <input value={form.__program ?? ''} onChange={e => setForm(p => ({ ...p, __program: e.target.value }))} className={inputCls} />

          </label>

          {editableKeys.map(key => (

            <label key={key} className="block text-[10px]">

              <span className="font-semibold text-slate-500">{DOUZONE_FIELD_LABELS[key] ?? key}</span>

              <input value={form[key] ?? ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className={inputCls} />

            </label>

          ))}

        </div>

      ) : lineEntries.length === 0 ? (

        <p className="text-[11px] text-slate-400">추가 상세정보 없음</p>

      ) : (

        <p className="text-[11px] leading-relaxed text-slate-800 break-words">

          {lineEntries.map((e, i) => (

            <span key={e.label}>

              {i > 0 && <span className="text-slate-300 mx-1">·</span>}

              <span className="text-slate-500">{e.label}</span>{' '}

              <span className="font-medium">{e.value}</span>

            </span>

          ))}

        </p>

      )}

    </section>

  );

}



function toForm(intakeData: Record<string, unknown>, feeSummary: number | null, program: string) {

  const form: Record<string, string> = {

    __feeSummary: feeSummary != null ? String(feeSummary) : '',

    __program: program ?? '',

  };

  for (const [key, value] of Object.entries(intakeData)) {

    if (DETAIL_SKIP_KEYS.has(key)) continue;

    if (value != null && String(value).trim()) form[key] = String(value);

  }

  return form;

}

