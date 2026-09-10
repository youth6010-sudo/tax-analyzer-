'use client';

import { portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type { FeeLineItem } from '@/app/utils/feeBreakdown';
import { feeItemAnnualAmount, isMonthlyAnnualFeeItem } from '@/app/utils/feeBreakdown';
import ClientEditHistoryButton from '@/app/components/clients/ClientEditHistoryButton';

export type ExpandField = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

function formatFee(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

export default function ClientRowExpandPanel({
  clientId,
  fields,
  onDetailClick,
  onPrefetch,
  feeRefreshKey = 0,
  feeItems,
  showFeeHistory = true,
  extraContent,
}: {
  clientId: string;
  fields: ExpandField[];
  onDetailClick: (e: React.MouseEvent) => void;
  onPrefetch?: () => void;
  feeRefreshKey?: number;
  feeItems?: FeeLineItem[];
  showFeeHistory?: boolean;
  extraContent?: React.ReactNode;
}) {
  return (
    <div className="relative mt-1 pt-1 border-t border-slate-200/80">
      <button
        type="button"
        onClick={onDetailClick}
        onMouseEnter={onPrefetch}
        className={`${portalBtnSecondary} absolute top-1 right-0 text-[11px] !px-1.5 !py-0.5 z-10`}
      >
        상세보기
      </button>

      <dl className="space-y-1 text-xs pr-14">
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-1.5 gap-y-1 items-baseline">
          {fields.map(field => (
            <div key={field.label} className="contents">
              <dt className="text-[11px] font-semibold text-slate-600">{field.label}</dt>
              <dd
                className={[
                  'min-w-0 truncate text-slate-800',
                  field.mono ? 'portal-data' : 'font-medium',
                ].join(' ')}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </div>
        {extraContent}
      </dl>

      {feeItems && feeItems.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-500 tabular-nums">
          {feeItems.map((item, i) => (
            <li key={`${item.itemName}-${i}`} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {item.itemName}
                {isMonthlyAnnualFeeItem(item.itemName) ? ' ×12' : ''}
              </span>
              <span className="shrink-0">{formatFee(feeItemAnnualAmount(item))}</span>
            </li>
          ))}
        </ul>
      )}

      {showFeeHistory && (
        <div className="mt-2 pt-1.5 border-t border-slate-100">
          <ClientEditHistoryButton
            key={`${clientId}-${feeRefreshKey}`}
            clientId={clientId}
            compact
          />
        </div>
      )}
    </div>
  );
}
