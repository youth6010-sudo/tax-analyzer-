'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import { portalBtnPrimary, portalBtnSecondary, portalInput, portalLabel } from '@/app/components/portal/uiClasses';
import {
  computeFeeSummary,
  parseFeeInput,
  readFeeBreakdown,
  resolveClientFeeSummary,
  type FeeBreakdownSave,
} from '@/app/utils/feeBreakdown';

function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

export default function ClientFeeCell({
  clientId,
  value,
  intakeData,
  onSave,
  className = '',
  readOnly = false,
}: {
  clientId: string;
  value: number | null;
  intakeData?: Record<string, unknown>;
  onSave?: (id: string, payload: FeeBreakdownSave) => void;
  className?: string;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [bookkeepingDraft, setBookkeepingDraft] = useState('');
  const [adjustmentDraft, setAdjustmentDraft] = useState('');

  const displayFee = resolveClientFeeSummary(value, intakeData);
  const display = displayFee != null && Number.isFinite(displayFee) ? displayFee.toLocaleString('ko-KR') : '—';

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { bookkeepingFee, adjustmentFee } = readFeeBreakdown(intakeData);
    setBookkeepingDraft(bookkeepingFee != null ? String(bookkeepingFee) : '');
    setAdjustmentDraft(adjustmentFee != null ? String(adjustmentFee) : '');
    setOpen(true);
  };

  const bookkeeping = parseFeeInput(bookkeepingDraft);
  const adjustment = parseFeeInput(adjustmentDraft);
  const previewTotal = computeFeeSummary(bookkeeping, adjustment);

  const commit = () => {
    const payload: FeeBreakdownSave = {
      bookkeepingFee: bookkeeping,
      adjustmentFee: adjustment,
      feeSummary: previewTotal,
    };
    setOpen(false);
    const prev = readFeeBreakdown(intakeData);
    const unchanged =
      (prev.bookkeepingFee ?? null) === payload.bookkeepingFee &&
      (prev.adjustmentFee ?? null) === payload.adjustmentFee &&
      (displayFee ?? null) === payload.feeSummary;
    if (!unchanged) onSave?.(clientId, payload);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const modal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
        onClick={e => {
          e.stopPropagation();
          setOpen(false);
        }}
        role="presentation"
      >
        <div
          className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-slate-200 p-5"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`fee-editor-${clientId}`}
        >
          <h3 id={`fee-editor-${clientId}`} className="text-base font-semibold text-slate-900 mb-4">
            {CLIENT_FIELD_LABELS.fee} 입력
          </h3>

          <div className="space-y-3">
            <label className={`${portalLabel} flex flex-col gap-1 items-stretch`}>
              <span>{CLIENT_FIELD_LABELS.bookkeepingFee}</span>
              <input
                type="text"
                inputMode="numeric"
                value={bookkeepingDraft}
                onChange={e => setBookkeepingDraft(e.target.value.replace(/[^\d,]/g, ''))}
                className={portalInput}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  }
                }}
              />
            </label>
            <label className={`${portalLabel} flex flex-col gap-1 items-stretch`}>
              <span>{CLIENT_FIELD_LABELS.adjustmentFee}</span>
              <input
                type="text"
                inputMode="numeric"
                value={adjustmentDraft}
                onChange={e => setAdjustmentDraft(e.target.value.replace(/[^\d,]/g, ''))}
                className={portalInput}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  }
                }}
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm">
            <p className="text-slate-500 mb-1">
              {CLIENT_FIELD_LABELS.bookkeepingFee}×12 + {CLIENT_FIELD_LABELS.adjustmentFee}
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-900">{formatAmount(previewTotal)}</p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={portalBtnSecondary}>
              취소
            </button>
            <button type="button" onClick={commit} className={portalBtnPrimary}>
              저장
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  if (readOnly) {
    return (
      <span
        title={`${CLIENT_FIELD_LABELS.fee} (본인 담당만 수정 가능)`}
        className={`block w-full min-w-[5rem] text-right text-base font-semibold tabular-nums whitespace-nowrap text-gray-500 px-1.5 py-1 ${className}`}
      >
        {display}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={`클릭하여 ${CLIENT_FIELD_LABELS.fee} 입력`}
        className={`w-full min-w-[5rem] text-right text-base font-semibold tabular-nums whitespace-nowrap text-gray-900 hover:bg-blue-50 hover:text-blue-900 rounded px-1.5 py-1 transition-colors ${className}`}
      >
        {display}
      </button>
      {modal}
    </>
  );
}
