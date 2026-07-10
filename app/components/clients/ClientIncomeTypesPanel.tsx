'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SIMPLE_PAYROLL_INCOME_KEYS,
  SIMPLE_PAYROLL_INCOME_LABELS,
  YEAR_END_PANEL_INCOME_KEYS,
  YEAR_END_INCOME_LABELS,
  EMPTY_YEAR_END_TYPES,
  type ClientIncomeTypes,
  type IncomeTypeKey,
  type YearEndClientTypes,
  type YearEndPanelIncomeKey,
} from '@/app/types/incomeTypes';
import { portalBtnPrimary, portalBtnSecondary, portalCard } from '@/app/components/portal/uiClasses';

type Props = {
  clientId: string;
  canEdit: boolean;
  compact?: boolean;
  onSaved?: (types: ClientIncomeTypes) => void;
};

export default function ClientIncomeTypesPanel({
  clientId,
  canEdit,
  compact = false,
  onSaved,
}: Props) {
  const [types, setTypes] = useState<ClientIncomeTypes | null>(null);
  const [yearEndTypes, setYearEndTypes] = useState<YearEndClientTypes>(EMPTY_YEAR_END_TYPES);
  const [semiAnnualTarget, setSemiAnnualTarget] = useState(false);
  const [semiAnnualMonthly, setSemiAnnualMonthly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/income-types`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setTypes(data.incomeTypes as ClientIncomeTypes);
    setYearEndTypes({
      ...EMPTY_YEAR_END_TYPES,
      retirement: Boolean((data.yearEndTypes as YearEndClientTypes)?.retirement),
      interestDividend: Boolean((data.yearEndTypes as YearEndClientTypes)?.interestDividend),
    });
    setSemiAnnualTarget(Boolean(data.withholdingSettings?.semiAnnualTarget));
    setSemiAnnualMonthly(Boolean(data.withholdingSettings?.semiAnnualMonthlyDisplay));
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSimple = (key: IncomeTypeKey) => {
    if (!canEdit || !types) return;
    setTypes({ ...types, [key]: !types[key] });
  };

  const toggleYearEnd = (key: YearEndPanelIncomeKey) => {
    if (!canEdit) return;
    setYearEndTypes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const normalizedYearEndTypes = (): YearEndClientTypes => ({
    ...EMPTY_YEAR_END_TYPES,
    retirement: yearEndTypes.retirement,
    interestDividend: yearEndTypes.interestDividend,
  });

  const save = async () => {
    if (!canEdit || !types) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/income-types`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incomeTypes: types,
          yearEndTypes: normalizedYearEndTypes(),
          withholdingSettings: {
            semiAnnualTarget,
            semiAnnualMonthlyDisplay: semiAnnualMonthly,
          },
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      setTypes(data.incomeTypes);
      setYearEndTypes({
        ...EMPTY_YEAR_END_TYPES,
        retirement: Boolean(data.yearEndTypes?.retirement),
        interestDividend: Boolean(data.yearEndTypes?.interestDividend),
      });
      onSaved?.(data.incomeTypes);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!types) {
    return (
      <div className={compact ? 'text-xs text-slate-400' : portalCard + ' p-4 text-sm text-slate-400'}>
        소득 유형 불러오는 중…
      </div>
    );
  }

  const checkboxCls =
    'flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm transition-colors hover:border-blue-300 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50';

  const yearEndCheckboxCls =
    'flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm transition-colors hover:border-violet-300 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50';

  return (
    <div className={compact ? 'space-y-3' : portalCard + ' space-y-4 p-4'}>
      {!compact && (
        <div>
          <h3 className="text-sm font-bold text-slate-800">신고대상 여부</h3>
          <p className="mt-0.5 text-xs text-slate-500">간이지급명세서 · 연말정산지급명세서</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-bold text-blue-800">간이지급명세서</p>
        <div className="flex flex-wrap gap-2">
          {SIMPLE_PAYROLL_INCOME_KEYS.map(key => (
            <label key={key} className={checkboxCls}>
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={types[key]}
                disabled={!canEdit}
                onChange={() => toggleSimple(key)}
              />
              <span className="font-medium text-slate-700">{SIMPLE_PAYROLL_INCOME_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-bold text-violet-800">연말정산지급명세서</p>
        <p className="mb-2 text-[11px] text-slate-500">
          근로·사업·기타는 간이지급에서 월별로 켜고 끕니다. 같은 해 간이지급에 접수(체크)된
          항목은 지금 설정이 꺼져 있어도 연말정산에 표시됩니다. 퇴직·이자배당만 여기서 별도
          설정합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {YEAR_END_PANEL_INCOME_KEYS.map(key => (
            <label key={key} className={yearEndCheckboxCls}>
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={yearEndTypes[key]}
                disabled={!canEdit}
                onChange={() => toggleYearEnd(key)}
              />
              <span className="font-medium text-slate-700">{YEAR_END_INCOME_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-bold text-slate-600">원천세 반기 신고</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="accent-blue-600"
            checked={semiAnnualTarget}
            disabled={!canEdit}
            onChange={() => setSemiAnnualTarget(v => !v)}
          />
          <span>반기 신고대상</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="accent-blue-600"
            checked={semiAnnualMonthly}
            disabled={!canEdit || !semiAnnualTarget}
            onChange={() => setSemiAnnualMonthly(v => !v)}
          />
          <span>매월 표시 (반기 대상일 때)</span>
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canEdit && (
        <div className="flex gap-2">
          <button type="button" className={portalBtnPrimary} disabled={saving} onClick={() => void save()}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" className={portalBtnSecondary} disabled={saving} onClick={() => void load()}>
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}
