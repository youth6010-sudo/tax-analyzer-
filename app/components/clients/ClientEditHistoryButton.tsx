'use client';

import { useCallback, useEffect, useState } from 'react';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

export type ClientHistoryItem = {
  id: string;
  kind: 'fee' | 'manager';
  changedByName: string;
  changedAt: string;
  summary: string;
};

function formatChangedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 수정이력 버튼 — 누르면 누가·언제·무엇을 변경했는지 표시 */
export default function ClientEditHistoryButton({
  clientId,
  className = '',
  compact = false,
  defaultOpen = false,
}: {
  clientId: string;
  className?: string;
  /** 펼침 패널용 작은 스타일 */
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ClientHistoryItem[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/clients/${clientId}/edit-history`, { cache: 'no-store' });
      const data = r.ok ? await r.json() : null;
      const list = Array.isArray(data?.items) ? (data.items as ClientHistoryItem[]) : [];
      setItems(list);
    } catch {
      setError('이력을 불러오지 못했습니다.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className={
          compact
            ? 'text-[11px] font-semibold text-slate-600 hover:text-blue-700 underline-offset-2 hover:underline'
            : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50'
        }
      >
        {open ? '수정이력 닫기' : '수정이력'}
      </button>

      {open && (
        <div
          className={
            compact
              ? 'mt-1.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5'
              : 'mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5'
          }
          onClick={e => e.stopPropagation()}
        >
          {loading ? (
            <p className="text-[11px] text-slate-400">불러오는 중…</p>
          ) : error ? (
            <p className="text-[11px] text-rose-600">{error}</p>
          ) : !items || items.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              수정이력 없음 ({CLIENT_FIELD_LABELS.fee}·담당자 변경 시 기록)
            </p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {items.map(item => (
                <li key={item.id} className="text-[11px] text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-900">
                    {item.changedByName || '알 수 없음'}
                  </span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="tabular-nums text-slate-500">{formatChangedAt(item.changedAt)}</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span>{item.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
