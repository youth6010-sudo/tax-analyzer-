'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';
import {
  isClientCorporateForMaterials,
  materialsPlaceholders,
  readMaterialsBundle,
  saveMaterialsBundle,
  type MaterialsBundle,
} from '@/lib/clientMaterials';

const inputCls =
  'w-full rounded-md border border-slate-200/80 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 resize-y min-h-[3rem]';

type FieldDef = { key: keyof MaterialsBundle; label: string; placeholder?: string; rows?: number };

type TaxCardTheme = {
  card: string;
  title: string;
  label: string;
  fieldBg: string;
};

const TAX_CARD_THEMES: Record<string, TaxCardTheme> = {
  원천세: {
    card: 'border-violet-200 bg-gradient-to-br from-violet-50/90 to-white',
    title: 'text-violet-800',
    label: 'text-violet-600/90',
    fieldBg: 'focus:border-violet-400',
  },
  부가세: {
    card: 'border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white',
    title: 'text-emerald-800',
    label: 'text-emerald-600/90',
    fieldBg: 'focus:border-emerald-400',
  },
  법인세: {
    card: 'border-blue-200 bg-gradient-to-br from-blue-50/90 to-white',
    title: 'text-blue-800',
    label: 'text-blue-600/90',
    fieldBg: 'focus:border-blue-400',
  },
  소득세: {
    card: 'border-blue-200 bg-gradient-to-br from-blue-50/90 to-white',
    title: 'text-blue-800',
    label: 'text-blue-600/90',
    fieldBg: 'focus:border-blue-400',
  },
  기타: {
    card: 'border-slate-200 bg-gradient-to-br from-slate-50/90 to-white',
    title: 'text-slate-700',
    label: 'text-slate-500',
    fieldBg: 'focus:border-slate-400',
  },
};

type Props = {
  client: ClientRecord;
  canEdit?: boolean;
  compact?: boolean;
  embedded?: boolean;
  onSaved?: (intakeData: Record<string, unknown>) => void;
};

export default function ClientMaterialsSection({
  client,
  canEdit = true,
  compact = false,
  embedded = false,
  onSaved,
}: Props) {
  const isCorporate = isClientCorporateForMaterials(client);
  const placeholders = materialsPlaceholders(isCorporate);
  const [bundle, setBundle] = useState<MaterialsBundle>(() => readMaterialsBundle(client));
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setBundle(readMaterialsBundle(client));
  }, [client.id, client.intakeData]);

  const setField = useCallback(<K extends keyof MaterialsBundle>(key: K, value: MaterialsBundle[K]) => {
    setBundle(prev => ({ ...prev, [key]: value }));
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const intake = (client.intakeData ?? {}) as Record<string, unknown>;
      const nextIntake = await saveMaterialsBundle(client.id, intake, bundle, isCorporate);
      onSaved?.(nextIntake);
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const incomeTaxTitle = isCorporate ? '법인세' : '소득세';

  const fields: FieldDef[] = [
    { key: 'withholdingMaterials', label: '필요자료', placeholder: placeholders.withholding, rows: 3 },
    { key: 'withholdingNotes', label: '특이사항', placeholder: placeholders.withholdingNotes, rows: 3 },
    { key: 'vatMaterials', label: '필요자료', placeholder: placeholders.vat, rows: 3 },
    { key: 'vatNotes', label: '특이사항', placeholder: placeholders.vatNotes, rows: 3 },
    isCorporate
      ? { key: 'corporateMaterials', label: '필요자료', placeholder: placeholders.corporate, rows: 3 }
      : { key: 'incomeMaterials', label: '필요자료', placeholder: placeholders.income, rows: 3 },
    isCorporate
      ? { key: 'corporateNotes', label: '특이사항', placeholder: placeholders.corporateNotes, rows: 3 }
      : { key: 'incomeNotes', label: '특이사항', placeholder: placeholders.incomeNotes, rows: 3 },
    { key: 'otherMaterials', label: '특이사항', placeholder: placeholders.other, rows: 3 },
  ];

  const taxGroups: { title: string; fields: FieldDef[]; singleCol?: boolean }[] = [
    { title: '원천세', fields: fields.slice(0, 2) },
    { title: '부가세', fields: fields.slice(2, 4) },
    { title: incomeTaxTitle, fields: fields.slice(4, 6) },
    { title: '기타', fields: fields.slice(6), singleCol: true },
  ];

  const renderField = (f: FieldDef, theme: TaxCardTheme) => (
    <label key={f.key} className="block min-w-0">
      <span className={`text-[10px] font-bold uppercase tracking-wide ${theme.label}`}>{f.label}</span>
      {canEdit ? (
        <textarea
          value={bundle[f.key]}
          onChange={e => setField(f.key, e.target.value)}
          rows={f.rows ?? 3}
          placeholder={f.placeholder}
          className={`${inputCls} ${theme.fieldBg}`}
        />
      ) : (
        <p className="mt-1 min-h-[3rem] whitespace-pre-wrap break-words rounded-md border border-slate-100 bg-white/80 px-2 py-1.5 text-xs text-slate-800">
          {bundle[f.key].trim() ? bundle[f.key] : <span className="text-slate-400">—</span>}
        </p>
      )}
    </label>
  );

  const renderTaxCard = (g: { title: string; fields: FieldDef[]; singleCol?: boolean }) => {
    const theme = TAX_CARD_THEMES[g.title] ?? TAX_CARD_THEMES['기타'];
    return (
      <div
        key={g.title}
        className={`rounded-xl border p-3 shadow-sm ${theme.card} ${g.singleCol ? 'sm:max-w-none' : ''}`}
      >
        <h3 className={`mb-2 text-sm font-bold ${theme.title}`}>{g.title}</h3>
        <div className={`grid gap-2 ${g.singleCol ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
          {g.fields.map(f => renderField(f, theme))}
        </div>
      </div>
    );
  };

  return (
    <div className={embedded ? '' : compact ? 'mt-1.5' : 'border-t border-slate-200 pt-2'}>
      {!embedded && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-bold text-slate-500">필요자료 · 특이사항</h4>
          {canEdit && (
            <div className="flex items-center gap-2">
              {savedTick && <span className="text-[10px] font-medium text-emerald-600">저장됨</span>}
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className={compact ? `${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]` : portalBtnPrimary}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          )}
        </div>
      )}
      {embedded && canEdit && (
        <div className="mb-2 flex items-center justify-end gap-2">
          {savedTick && <span className="text-[10px] font-medium text-emerald-600">저장됨</span>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={`${portalBtnSecondary} !px-2 !py-0.5 !text-[10px]`}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      )}
      {error && <p className="mb-1 text-[10px] text-rose-600">{error}</p>}
      {embedded ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {taxGroups.map(renderTaxCard)}
        </div>
      ) : (
        <div className={`grid gap-1 ${compact ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
          {fields.map(f => (
            <label key={f.key} className="block min-w-0">
              <span className="text-[10px] font-semibold text-slate-500">{f.label}</span>
              {canEdit ? (
                <textarea
                  value={bundle[f.key]}
                  onChange={e => setField(f.key, e.target.value)}
                  rows={f.rows ?? 2}
                  placeholder={f.placeholder}
                  className={inputCls}
                />
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-slate-800">
                  {bundle[f.key].trim() ? bundle[f.key] : <span className="text-slate-400">—</span>}
                </p>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
