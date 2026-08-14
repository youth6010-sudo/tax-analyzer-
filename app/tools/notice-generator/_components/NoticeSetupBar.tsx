'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { TAX_TYPE_LIST } from '../_lib/taxTypes';
import {
  TAX_TYPES,
  VAT_PERIODS,
  CORPORATE_FY_END_MONTHS,
  CORP_NOTICE_PHASES,
  INCOME_FILING_TYPES,
} from '../_lib/taxTypes';
import { SELECTABLE_YEARS } from '../_lib/holidays';
import type { DeadlineParams, DeadlineResult, MaterialDeadline, TaxTypeKey } from '../_lib/types';
import type { NoticeOutputMode, OfficialLetterKind } from '../_lib/officialLetter';
import { taxTypeForOfficialKind } from '../_lib/officialLetter';
import NoticeOutputModeSelector from './NoticeOutputModeSelector';
import OfficialTaxKindSelector from './OfficialTaxKindSelector';
import VatBusinessTypeToggle from './VatBusinessTypeToggle';
import type { VatBusinessType } from '../_lib/vatBusinessItems';
import {
  noticeHalfRow,
  noticeInput,
  noticeLabel,
  noticeMeta,
  noticeSection,
  noticeTwoCol,
} from './noticeUi';

const selectClass = `${noticeInput} mt-1 w-full min-w-0 box-border`;
const fieldClass = `${noticeInput} w-full min-w-0 box-border`;
const inlineField = 'block min-w-0 shrink-0';

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9);
const MINUTES = [0, 30];

function isoToDotted(iso: string): string {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${y}.${m}.${d}` : '';
}

function formatDigits(digits: string): string {
  const v = digits.slice(0, 8);
  return [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)].filter(Boolean).join('.');
}

function digitsToIso(digits: string): string | null {
  if (digits.length !== 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

type Props = {
  outputMode: NoticeOutputMode;
  onOutputModeChange: (mode: NoticeOutputMode) => void;
  officialTaxKind: OfficialLetterKind;
  onOfficialTaxKindChange: (kind: OfficialLetterKind) => void;
  taxType: TaxTypeKey;
  onSelectTax: (key: TaxTypeKey) => void;
  params: DeadlineParams;
  onParamChange: (key: keyof DeadlineParams, value: string | number) => void;
  deadline: DeadlineResult | null;
  taxLabel: string;
  materialDeadline: MaterialDeadline;
  onMaterialDeadlineChange: (next: MaterialDeadline) => void;
  clientPicker?: ReactNode;
  vatBusinessType?: VatBusinessType;
  onVatBusinessTypeChange?: (value: VatBusinessType) => void;
  hideMaterialDeadline?: boolean;
};

function PeriodSecondField({
  taxType,
  params,
  onParamChange,
}: {
  taxType: TaxTypeKey;
  params: DeadlineParams;
  onParamChange: (key: keyof DeadlineParams, value: string | number) => void;
}) {
  const label =
    taxType === TAX_TYPES.WITHHOLDING
      ? '지급 월'
      : taxType === TAX_TYPES.VAT
        ? '과세기간'
        : taxType === TAX_TYPES.CORPORATE
          ? '신고 구분'
          : taxType === TAX_TYPES.INCOME
            ? '신고 유형'
            : '추가 선택';

  return (
    <label className="block min-w-0">
      <span className={noticeLabel}>{label}</span>
      {taxType === TAX_TYPES.WITHHOLDING && (
        <select
          className={selectClass}
          value={params.month}
          onChange={e => onParamChange('month', Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
      )}
      {taxType === TAX_TYPES.VAT && (
        <select
          className={selectClass}
          value={params.vatPeriodId}
          onChange={e => onParamChange('vatPeriodId', e.target.value)}
        >
          {VAT_PERIODS.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      {taxType === TAX_TYPES.CORPORATE && (
        <div className="space-y-1.5">
          <select
            className={selectClass}
            value={params.corpPhase === '중간예납' ? '중간예납' : '확정'}
            onChange={e => onParamChange('corpPhase', e.target.value)}
          >
            {CORP_NOTICE_PHASES.map(ph => (
              <option key={ph} value={ph}>
                {ph === '중간예납' ? '법인세 중간예납' : '법인세 확정'}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={params.fyEndMonth}
            onChange={e => onParamChange('fyEndMonth', Number(e.target.value))}
          >
            {CORPORATE_FY_END_MONTHS.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {taxType === TAX_TYPES.INCOME && (
        <select
          className={selectClass}
          value={params.filingTypeId}
          onChange={e => onParamChange('filingTypeId', e.target.value)}
        >
          {INCOME_FILING_TYPES.map(f => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

export default function NoticeSetupBar({
  outputMode,
  onOutputModeChange,
  officialTaxKind,
  onOfficialTaxKindChange,
  taxType,
  onSelectTax,
  params,
  onParamChange,
  deadline,
  taxLabel,
  materialDeadline,
  onMaterialDeadlineChange,
  clientPicker,
  vatBusinessType = 'individual',
  onVatBusinessTypeChange,
  hideMaterialDeadline = false,
}: Props) {
  const updateMaterial = (patch: Partial<MaterialDeadline>) =>
    onMaterialDeadlineChange({ ...materialDeadline, ...patch });

  const [dateText, setDateText] = useState(() => isoToDotted(materialDeadline.date));

  useEffect(() => {
    setDateText(isoToDotted(materialDeadline.date));
  }, [materialDeadline.date]);

  const handleDateText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setDateText(formatDigits(digits));
    const iso = digitsToIso(digits);
    if (iso) updateMaterial({ date: iso });
  };

  const isMessageMode = outputMode === 'message';
  const isOfficialNav = outputMode === 'official';
  const periodTaxType = isOfficialNav ? taxTypeForOfficialKind(officialTaxKind) : taxType;
  const showVatBusiness =
    onVatBusinessTypeChange && officialTaxKind === 'vat' && isOfficialNav;

  return (
    <div className={`${noticeSection} space-y-3`}>
      <NoticeOutputModeSelector mode={outputMode} onSelect={onOutputModeChange} />

      {isMessageMode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={noticeLabel}>세목</span>
          <div className="flex flex-wrap gap-1.5">
            {TAX_TYPE_LIST.map(tax => (
              <button
                key={tax.key}
                type="button"
                onClick={() => onSelectTax(tax.key)}
                className={[
                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                  taxType === tax.key
                    ? 'border-blue-300 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {tax.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isOfficialNav && (
        <>
          <div className="flex flex-wrap items-start gap-3">
            <OfficialTaxKindSelector value={officialTaxKind} onChange={onOfficialTaxKindChange} />
            <div className="min-h-[34px] min-w-[220px]">
              {showVatBusiness && (
                <VatBusinessTypeToggle value={vatBusinessType} onChange={onVatBusinessTypeChange} />
              )}
            </div>
          </div>
        </>
      )}

      <div className={noticeTwoCol}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className={noticeHalfRow}>
            <label className="block min-w-0">
              <span className={noticeLabel}>
                {periodTaxType === TAX_TYPES.INCOME ? '귀속 연도' : '기준 연도'}
              </span>
              <select
                className={selectClass}
                value={params.year}
                onChange={e => onParamChange('year', Number(e.target.value))}
              >
                {SELECTABLE_YEARS.map(y => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
            </label>
            <PeriodSecondField
              taxType={periodTaxType}
              params={params}
              onParamChange={onParamChange}
            />
          </div>

          {!hideMaterialDeadline && (
          <div className={noticeHalfRow}>
            <label className="block min-w-0">
              <span className={noticeLabel}>자료 제출 마감</span>
              <input
                type="text"
                inputMode="numeric"
                value={dateText}
                onChange={e => handleDateText(e.target.value)}
                placeholder="2026.07.27"
                maxLength={10}
                className={fieldClass}
              />
            </label>
            <div className="flex min-w-0 items-end gap-2">
              <label className={`${inlineField} min-w-0 flex-1`}>
                <span className={noticeLabel}>시</span>
                <select
                  value={materialDeadline.hour}
                  onChange={e => updateMaterial({ hour: Number(e.target.value) })}
                  className={fieldClass}
                >
                  {HOURS.map(h => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}시
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${inlineField} min-w-0 flex-1`}>
                <span className={noticeLabel}>분</span>
                <select
                  value={materialDeadline.minute}
                  onChange={e => updateMaterial({ minute: Number(e.target.value) })}
                  className={fieldClass}
                >
                  {MINUTES.map(m => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}분
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          )}
        </div>

        {deadline && (
          <div className="flex min-h-full min-w-0 flex-col justify-center self-stretch rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className={`${noticeMeta} !mt-0`}>
              {taxLabel} · {deadline.periodLabel}
            </p>
            <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
              마감 {deadline.finalText}
            </p>
            {deadline.wasAdjusted && (
              <p className="mt-1 text-[11px] text-amber-700">
                휴일 보정 ({deadline.statutoryText})
              </p>
            )}
          </div>
        )}
      </div>

      {clientPicker && (
        <div className="w-full min-w-0 border-t border-slate-100 pt-3">
          <span className={noticeLabel}>수임처 연결</span>
          <div className="mt-1 w-full min-w-0">{clientPicker}</div>
        </div>
      )}
    </div>
  );
}
