'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import { portalBtnPrimary, portalBtnSecondary, portalInput, portalLabel } from '@/app/components/portal/uiClasses';
import {
  computeFeeSummaryFromItems,
  feeItemAnnualAmount,
  isMonthlyAnnualFeeItem,
  parseFeeInput,
  readFeeItems,
  resolveClientFeeSummary,
  type FeeBreakdownSave,
  type FeeLineItem,
} from '@/app/utils/feeBreakdown';

function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

function formatSupplyInput(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('ko-KR') : '';
}

function draftToItems(
  drafts: { itemName: string; supplyDraft: string }[],
): FeeLineItem[] {
  return drafts
    .map(d => {
      const itemName = d.itemName.trim();
      const supplyAmount = parseFeeInput(d.supplyDraft.replace(/,/g, ''));
      if (!itemName || supplyAmount == null) return null;
      return { itemName, supplyAmount };
    })
    .filter((i): i is FeeLineItem => i != null);
}

export default function ClientFeeCell({
  clientId,
  value,
  intakeData,
  corpRevenueThisYear,
  onSave,
  className = '',
  readOnly = false,
  hidden = false,
}: {
  clientId: string;
  value: number | null;
  intakeData?: Record<string, unknown>;
  /** 법인세 검토표 올해 매출액 (열 9) */
  corpRevenueThisYear?: number | null;
  onSave?: (id: string, payload: FeeBreakdownSave) => void;
  className?: string;
  readOnly?: boolean;
  /** 타 담당자 업체 — 금액 비표시 */
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<{ itemName: string; supplyDraft: string }[]>([]);

  const displayFee = resolveClientFeeSummary(value, intakeData);
  const display = displayFee != null && Number.isFinite(displayFee) ? displayFee.toLocaleString('ko-KR') : '—';
  const savedItems = readFeeItems(intakeData);

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const saved = readFeeItems(intakeData);
    setDrafts(
      saved.length
        ? saved.map(i => ({ itemName: i.itemName, supplyDraft: formatSupplyInput(i.supplyAmount) }))
        : [{ itemName: '', supplyDraft: '' }],
    );
    setOpen(true);
  };

  const items = draftToItems(drafts);
  const previewTotal = computeFeeSummaryFromItems(items);

  const commit = () => {
    const payload: FeeBreakdownSave = {
      feeItems: items,
      feeSummary: previewTotal,
    };
    setOpen(false);
    const unchanged =
      JSON.stringify(savedItems) === JSON.stringify(items) && (displayFee ?? null) === payload.feeSummary;
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
          className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 p-5 max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`fee-editor-${clientId}`}
        >
          <h3 id={`fee-editor-${clientId}`} className="text-base font-semibold text-slate-900 mb-1">
            {CLIENT_FIELD_LABELS.fee} 입력
          </h3>
          <p className="text-[11px] text-slate-500 mb-4">
            기장수수료·기타수수료는 공급가액×12, 그 외 품목은 공급가액 그대로 합산합니다.
          </p>

          {!hidden && (
            <div className="mb-4 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-sm">
              <p className="text-[11px] font-medium text-sky-800 mb-0.5">올해 매출액 (법인세 검토표)</p>
              <p className="text-base font-bold tabular-nums text-slate-900">
                {corpRevenueThisYear != null && Number.isFinite(corpRevenueThisYear)
                  ? formatAmount(corpRevenueThisYear)
                  : '검토표에 없음'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {drafts.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end">
                <label className={`${portalLabel} flex flex-col gap-1 items-stretch min-w-0`}>
                  <span className="text-[11px]">품목</span>
                  <input
                    type="text"
                    value={row.itemName}
                    onChange={e =>
                      setDrafts(list => list.map((r, i) => (i === idx ? { ...r, itemName: e.target.value } : r)))
                    }
                    className={portalInput}
                    placeholder="예) 기장수수료"
                  />
                </label>
                <label className={`${portalLabel} flex flex-col gap-1 items-stretch`}>
                  <span className="text-[11px]">공급가액</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.supplyDraft}
                    onChange={e =>
                      setDrafts(list =>
                        list.map((r, i) =>
                          i === idx ? { ...r, supplyDraft: e.target.value.replace(/[^\d,-]/g, '') } : r,
                        ),
                      )
                    }
                    className={portalInput}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setDrafts(list => list.filter((_, i) => i !== idx))}
                  className="mb-0.5 rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-500 hover:bg-slate-50"
                  disabled={drafts.length <= 1}
                  title="삭제"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDrafts(list => [...list, { itemName: '', supplyDraft: '' }])}
            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            + 품목 추가
          </button>

          {items.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              {items.map((item, i) => (
                <li key={`${item.itemName}-${i}`} className="flex justify-between gap-2 tabular-nums">
                  <span className="min-w-0 truncate">
                    {item.itemName}
                    {isMonthlyAnnualFeeItem(item.itemName) && (
                      <span className="text-slate-400"> ×12</span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-slate-800">
                    {formatAmount(feeItemAnnualAmount(item))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm">
            <p className="text-slate-500 mb-1">{CLIENT_FIELD_LABELS.fee} 합계</p>
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

  if (hidden) {
    return (
      <span
        className={`block w-full min-w-0 text-right text-xs tabular-nums text-slate-300 px-0.5 py-px ${className}`}
        aria-hidden
      >
        —
      </span>
    );
  }

  if (readOnly) {
    return (
      <span
        title={`${CLIENT_FIELD_LABELS.fee} (본인 담당만 수정 가능)`}
        className={`block w-full min-w-0 text-right text-xs font-semibold tabular-nums whitespace-nowrap text-gray-500 px-0.5 py-px ${className}`}
      >
        {display}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onDoubleClick={openModal}
        title={`더블클릭하여 ${CLIENT_FIELD_LABELS.fee} 수정`}
        className={`w-full min-w-0 text-right text-xs font-semibold tabular-nums whitespace-nowrap text-gray-900 hover:bg-blue-50 hover:text-blue-900 rounded px-0.5 py-px transition-colors ${className}`}
      >
        {display}
      </button>
      {modal}
    </>
  );
}
