'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import { DOUZONE_TAX_FLAG_LABELS } from '@/app/config/douzoneFields';
import { CLIENT_MAIN_CATEGORIES } from '@/app/utils/clientsGrouping';
import { businessEntityTypeForCategory } from '@/app/utils/clientBizNo';
import { markPortalClientsFresh, patchPortalClient } from '@/app/utils/portalStore';
import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';
import { MAIN_META_INTAKE_KEYS, MAIN_META_LABELS, TAX_FLAG_KEYS } from '@/lib/clientDouzoneLayout';
import { readWithholdingSettings } from '@/lib/incomeTypes';

const inputCls =
  'rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 min-w-0';

const TAX_FLAG_CHIP: Record<string, string> = {
  employed: 'bg-violet-50 text-violet-800 border-violet-200',
  daily: 'bg-sky-50 text-sky-800 border-sky-200',
  retirement: 'bg-orange-50 text-orange-800 border-orange-200',
  bizIncome: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  interestDividend: 'bg-amber-50 text-amber-800 border-amber-200',
  otherTax: 'bg-slate-50 text-slate-700 border-slate-200',
  laborContentReport: 'bg-rose-50 text-rose-800 border-rose-200',
  proxyPay: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
};

type Props = {
  clientId: string;
  intakeData: Record<string, unknown>;
  canEdit?: boolean;
  onSaved?: (intakeData: Record<string, unknown>) => void;
  /** 상세 통합 레이아웃 — 섹션 제목·테두리 생략 */
  embedded?: boolean;
  forcedEditing?: boolean;
  hideEditControls?: boolean;
  onSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** 통합 저장용 — intake 패치 + 대분류 */
  getPatchRef?: React.MutableRefObject<(() => {
    intakeData: Record<string, unknown>;
    category: string;
  }) | null>;
};

export default function ClientMainMetaSection({
  clientId,
  intakeData: initialIntake,
  canEdit = true,
  onSaved,
  embedded = false,
  forcedEditing,
  hideEditControls = false,
  onSaveRef,
  getPatchRef,
}: Props) {
  const [intake, setIntake] = useState(initialIntake);
  const [internalEditing, setInternalEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => buildForm(initialIntake));

  useEffect(() => {
    setIntake(initialIntake);
    setForm(buildForm(initialIntake));
  }, [clientId, initialIntake]);

  const buildIntakePatch = useCallback(() => {
    const taxFlags: Record<string, boolean> = {};
    for (const k of TAX_FLAG_KEYS) taxFlags[k] = !!form.flags[k];

    const intakePatch: Record<string, unknown> = {};
    for (const k of MAIN_META_INTAKE_KEYS) {
      intakePatch[k] = form.meta[k]?.trim() || null;
    }
    if (Object.values(taxFlags).some(Boolean)) intakePatch.taxFlags = taxFlags;
    else intakePatch.taxFlags = null;

    if (form.semiAnnualTarget || form.semiAnnualMonthlyDisplay) {
      intakePatch.withholdingSettings = {
        semiAnnualTarget: form.semiAnnualTarget,
        semiAnnualMonthlyDisplay: form.semiAnnualMonthlyDisplay,
      };
    } else {
      intakePatch.withholdingSettings = null;
    }

    const category = form.meta.category?.trim() ?? '';
    return { intakeData: intakePatch, category };
  }, [form]);

  useEffect(() => {
    if (getPatchRef) getPatchRef.current = () => buildIntakePatch();
  }, [buildIntakePatch, getPatchRef]);

  const wh = readWithholdingSettings(intake);
  const flags = (intake.taxFlags ?? {}) as Record<string, boolean>;
  const metaVisible = MAIN_META_INTAKE_KEYS.some(k => String(intake[k] ?? '').trim());
  const flagsVisible = TAX_FLAG_KEYS.some(k => flags[k]) || wh.semiAnnualTarget || wh.semiAnnualMonthlyDisplay;

  if (!metaVisible && !flagsVisible && !canEdit) return null;

  const editing = forcedEditing ?? internalEditing;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { intakeData: intakePatch, category } = buildIntakePatch();
      const syncedEntity = businessEntityTypeForCategory(category);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intakeData: intakePatch,
          ...(syncedEntity ? { businessEntityType: syncedEntity } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      const saved = (data.client?.intakeData ?? {}) as Record<string, unknown>;
      if (data.client) {
        patchPortalClient(clientId, data.client);
      } else {
        patchPortalClient(clientId, { intakeData: saved });
      }
      markPortalClientsFresh();
      setIntake(saved);
      setForm(buildForm(saved));
      setInternalEditing(false);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (onSaveRef) onSaveRef.current = () => save();
  });

  const showEditControls = canEdit && !hideEditControls;

  return (
    <section className={embedded ? '' : 'border-b border-slate-200 pb-3'}>
      {!embedded && (
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-600">사업장 · 신고대상</h3>
        {showEditControls && (
          <div className="flex gap-1.5">
            {editing ? (
              <>
                <button type="button" onClick={() => { setInternalEditing(false); setForm(buildForm(intake)); }} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>취소</button>
                <button type="button" disabled={saving} onClick={() => void save()} className={`${portalBtnPrimary} !px-2 !py-0.5 !text-[10px]`}>{saving ? '저장…' : '저장'}</button>
              </>
            ) : (
              <button type="button" onClick={() => setInternalEditing(true)} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>수정</button>
            )}
          </div>
        )}
      </div>
      )}
      {embedded && showEditControls && (
        <div className="mb-1.5 flex justify-end gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={() => { setInternalEditing(false); setForm(buildForm(intake)); }} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>취소</button>
              <button type="button" disabled={saving} onClick={() => void save()} className={`${portalBtnPrimary} !px-2 !py-0.5 !text-[10px]`}>{saving ? '저장…' : '저장'}</button>
            </>
          ) : (
            <button type="button" onClick={() => setInternalEditing(true)} className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}>수정</button>
          )}
        </div>
      )}
      {error && <p className="mb-1 text-[10px] text-rose-600">{error}</p>}

      {editing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {MAIN_META_INTAKE_KEYS.map(key => (
              <label key={key} className="flex min-w-[8rem] flex-1 items-center gap-1 text-[10px]">
                <span className="shrink-0 font-semibold text-slate-500">{MAIN_META_LABELS[key]}</span>
                <input
                  value={form.meta[key] ?? ''}
                  onChange={e => setForm(f => ({ ...f, meta: { ...f.meta, [key]: e.target.value } }))}
                  className={`${inputCls} flex-1`}
                  list={key === 'category' ? 'client-main-category-options' : undefined}
                />
              </label>
            ))}
          </div>
          <datalist id="client-main-category-options">
            {CLIENT_MAIN_CATEGORIES.map(cat => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
            {TAX_FLAG_KEYS.map(key => {
              const checked = !!form.flags[key];
              const chip = TAX_FLAG_CHIP[key] ?? 'bg-white text-slate-700 border-slate-200';
              return (
                <label
                  key={key}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    checked ? chip : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setForm(f => ({ ...f, flags: { ...f.flags, [key]: e.target.checked } }))}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  {DOUZONE_TAX_FLAG_LABELS[key]}
                </label>
              );
            })}
            <label className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/50 px-2 py-1 text-[11px] font-semibold text-blue-800">
              <input
                type="checkbox"
                checked={form.semiAnnualTarget}
                onChange={e => setForm(f => ({ ...f, semiAnnualTarget: e.target.checked, semiAnnualMonthlyDisplay: e.target.checked ? f.semiAnnualMonthlyDisplay : false }))}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              반기
            </label>
            <label className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${form.semiAnnualTarget ? 'border-blue-200 bg-blue-50/50 text-blue-800' : 'border-slate-200 bg-white text-slate-400'}`}>
              <input
                type="checkbox"
                checked={form.semiAnnualMonthlyDisplay}
                disabled={!form.semiAnnualTarget}
                onChange={e => setForm(f => ({ ...f, semiAnnualMonthlyDisplay: e.target.checked }))}
                className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-40"
              />
              매월
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-xs text-slate-800">
          {(metaVisible || canEdit) && (
            <p className="flex flex-wrap gap-x-3 gap-y-0.5">
              {MAIN_META_INTAKE_KEYS.map(key => {
                const v = String(intake[key] ?? '').trim();
                if (!v && !canEdit) return null;
                if (!v) return null;
                return (
                  <span key={key}>
                    <span className="text-slate-500">{MAIN_META_LABELS[key]}</span>{' '}
                    <span className="font-medium">{v}</span>
                  </span>
                );
              })}
            </p>
          )}
          {(flagsVisible || canEdit) && (
            <div className="flex flex-wrap gap-1.5">
              {TAX_FLAG_KEYS.filter(k => flags[k]).map(k => (
                <span
                  key={k}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TAX_FLAG_CHIP[k] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}
                >
                  {DOUZONE_TAX_FLAG_LABELS[k]}
                </span>
              ))}
              {wh.semiAnnualTarget && (
                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  반기{wh.semiAnnualMonthlyDisplay ? '·매월' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function buildForm(intakeData: Record<string, unknown>) {
  const flags = (intakeData.taxFlags ?? {}) as Record<string, boolean>;
  const wh = readWithholdingSettings(intakeData);
  const meta: Record<string, string> = {};
  for (const k of MAIN_META_INTAKE_KEYS) meta[k] = String(intakeData[k] ?? '');
  const flagState: Record<string, boolean> = {};
  for (const k of TAX_FLAG_KEYS) flagState[k] = !!flags[k];
  return {
    meta,
    flags: flagState,
    semiAnnualTarget: wh.semiAnnualTarget,
    semiAnnualMonthlyDisplay: wh.semiAnnualMonthlyDisplay,
  };
}
