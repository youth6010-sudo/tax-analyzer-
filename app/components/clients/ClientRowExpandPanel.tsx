'use client';

import { useEffect, useState } from 'react';

import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import { portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type { ClientFeeChange } from '@/app/types/client';
import type { FeeBreakdown } from '@/app/utils/feeBreakdown';

export type ExpandField = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

function formatFee(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

function formatChangedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function ClientRowExpandPanel({
  clientId,
  fields,
  onDetailClick,
  onPrefetch,
  feeRefreshKey = 0,
  feeBreakdown,
  showFeeHistory = true,
  extraContent,
}: {
  clientId: string;
  fields: ExpandField[];
  onDetailClick: (e: React.MouseEvent) => void;
  onPrefetch?: () => void;
  feeRefreshKey?: number;
  feeBreakdown?: FeeBreakdown;
  showFeeHistory?: boolean;
  extraContent?: React.ReactNode;
}) {
  const [changes, setChanges] = useState<ClientFeeChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showFeeHistory) {
      setChanges([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clients/${clientId}/fee-changes`)
      .then(r => (r.ok ? r.json() : { changes: [] }))
      .then(data => {
        if (!cancelled) setChanges(data.changes ?? []);
      })
      .catch(() => {
        if (!cancelled) setChanges([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, feeRefreshKey, showFeeHistory]);

  return (
    <div className="relative mt-2 pt-2 border-t border-slate-200/80">
      <button
        type="button"
        onClick={onDetailClick}
        onMouseEnter={onPrefetch}
        className={`${portalBtnSecondary} absolute top-2 right-0 text-sm px-2.5 py-1 z-10`}
      >
        상세보기
      </button>

      <dl className="space-y-2 text-base pr-24">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 items-baseline">
          {fields.map(field => (
            <div key={field.label} className="contents">
              <dt className="text-sm font-semibold text-slate-600">{field.label}</dt>
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

      {(feeBreakdown?.bookkeepingFee != null || feeBreakdown?.adjustmentFee != null) && (
        <p className="mt-2 text-sm text-slate-500 tabular-nums">
          {CLIENT_FIELD_LABELS.bookkeepingFee} {formatFee(feeBreakdown.bookkeepingFee)} ×12 +{' '}
          {CLIENT_FIELD_LABELS.adjustmentFee} {formatFee(feeBreakdown.adjustmentFee)}
        </p>
      )}

      {showFeeHistory && (
      <div className="mt-3 pt-2 border-t border-slate-100">
        <h4 className="text-sm font-semibold text-slate-600 mb-1.5">{CLIENT_FIELD_LABELS.fee} 변경 이력</h4>
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : changes.length === 0 ? (
          <p className="text-sm text-slate-400">변경 이력 없음</p>
        ) : (
          <ul className="space-y-1">
            {changes.map(c => (
              <li key={c.id} className="text-sm text-slate-600 tabular-nums">
                <span className="font-semibold text-slate-800">{c.changedByName}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span>{formatChangedAt(c.changedAt)}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span>
                  {formatFee(c.previousFee)} → {formatFee(c.newFee)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
