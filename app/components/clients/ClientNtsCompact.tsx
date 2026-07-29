'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  formatNtsDate,
  isNtsAlert,
  ntsBadgeClass,
  normalizeNtsTaxType,
  ntsStatusLabel,
  ntsTaxTypeBadgeClass,
  type NtsStatusView,
} from '@/app/utils/ntsStatus';

export default function ClientNtsCompact({
  clientId,
  businessNumber,
  initialNts = null,
  suppressChurnPrompt = false,
}: {
  clientId: string;
  businessNumber?: string;
  initialNts?: NtsStatusView | null;
  suppressChurnPrompt?: boolean;
}) {
  const normalizedBiz = (businessNumber || '').replace(/\D/g, '');
  const [nts, setNts] = useState<NtsStatusView | null>(initialNts);
  const [loading, setLoading] = useState(false);
  const [acking, setAcking] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/nts`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && data.nts) setNts(data.nts as NtsStatusView);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const ackResting = useCallback(async () => {
    setAcking(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/nts-ack`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((data.error as string) || '확인 실패');
      setNts(prev =>
        prev
          ? { ...prev, alertAckedAt: new Date().toISOString(), alertAckedCode: '02' }
          : prev,
      );
    } finally {
      setAcking(false);
    }
  }, [clientId]);

  if (!normalizedBiz) {
    return (
      <div className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5">
        <span className="text-[10px] font-bold text-slate-500">국세청</span>
        <p className="mt-0.5 text-[11px] text-slate-400">사업자번호 없음</p>
      </div>
    );
  }

  const alert = nts ? isNtsAlert(nts.statusCode) : false;
  const restingAcked = nts?.statusCode === '02' && nts.alertAckedCode === '02';
  const showPrompt = alert && !suppressChurnPrompt && !restingAcked;
  const taxLabel = nts ? normalizeNtsTaxType(nts.taxType) : '';
  const summary = nts
    ? [
        nts.closedDate && `폐업 ${formatNtsDate(nts.closedDate)}`,
        nts.checkedAt && `조회 ${new Date(nts.checkedAt).toLocaleDateString('ko-KR')}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '미조회';

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-slate-500 shrink-0">국세청</span>
        <button
          type="button"
          onClick={() => void check()}
          disabled={loading}
          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 shrink-0"
        >
          {loading ? '조회…' : '조회'}
        </button>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {nts && (
          <span
            className={`inline-flex rounded border px-1 py-0 text-[10px] font-semibold ${ntsBadgeClass(nts.statusCode)}`}
          >
            {ntsStatusLabel(nts)}
          </span>
        )}
        {taxLabel && (
          <span
            className={`inline-flex rounded border px-1 py-0 text-[10px] font-semibold ${ntsTaxTypeBadgeClass(taxLabel)}`}
          >
            {taxLabel}
          </span>
        )}
        <p className="text-[11px] leading-snug text-slate-700 break-words min-w-0 flex-1">{summary}</p>
      </div>
      {showPrompt && nts?.statusCode === '02' ? (
        <button
          type="button"
          disabled={acking}
          onClick={() => void ackResting()}
          className="mt-0.5 text-[10px] font-semibold text-amber-700 hover:underline disabled:opacity-50"
        >
          {acking ? '확인 중…' : '확인'}
        </button>
      ) : showPrompt ? (
        <Link
          href={`/clients/churn?prefillClientId=${clientId}`}
          className="mt-0.5 inline-block text-[10px] font-semibold text-rose-600 hover:underline"
        >
          유출 등록 →
        </Link>
      ) : null}
    </div>
  );
}
