'use client';

import { useRef, useState } from 'react';
import { portalBtnPrimary, portalBtnSecondary, portalCard } from '@/app/components/portal/uiClasses';

type SampleRow = {
  companyName: string;
  businessNo: string;
  kind: string;
  description: string;
  amount: number;
  eventDate: string;
  isPayment: boolean;
  isNew?: boolean;
  matched: boolean;
  matchedCompanyName: string | null;
};

type PreviewResult = {
  preview: true;
  filename: string;
  detected: string;
  total: number;
  matched: number;
  unmatched: number;
  newCount?: number;
  sample: SampleRow[];
};

type ApplyResult = {
  preview: false;
  filename: string;
  detected: string;
  total: number;
  applied: number;
  skipped: number;
  entryCount: number;
  duplicates: number;
};

type Props = {
  onApplied?: () => void;
  onClose?: () => void;
};

export default function ArrearsFeeEventsImport({ onApplied, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const upload = async (file: File, confirm: boolean) => {
    setBusy(true);
    setError('');
    if (!confirm) {
      setPreview(null);
      setApplyResult(null);
    }
    try {
      const form = new FormData();
      form.append('file', file);
      if (confirm) form.append('confirm', '1');
      const res = await fetch('/api/arrears/import-events', {
        method: 'POST',
        body: form,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '가져오기 실패');

      if ((data as { preview?: boolean }).preview) {
        setPreview(data as PreviewResult);
        setPendingFile(file);
      } else {
        setApplyResult(data as ApplyResult);
        setPreview(null);
        setPendingFile(null);
        onApplied?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기 실패');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const detectedLabel = (d: string) => {
    switch (d) {
      case 'tax_issuance':
        return '세금계산서 발급양식(품목)';
      case 'tax':
        return '세금계산서';
      case 'cms':
        return 'CMS/더빌';
      default:
        return '일반';
    }
  };

  return (
    <div className={`${portalCard} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">매출(세금계산서) · CMS 가져오기</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            세금계산서는 확인용이며, 원장상세 PDF에 없는 청구만 내역에 보충합니다.
            원장≠내역은 「잔액불일치」, 공문 없이 원장만 남은 잔액은 「원장만(장기미수)」입니다. 전체 재구성은{' '}
            <code className="rounded bg-slate-100 px-1">npx tsx scripts/rebuild-arrears-stack.ts --apply</code>
          </p>
        </div>
        {onClose ? (
          <button type="button" className={portalBtnSecondary} onClick={onClose}>
            닫기
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void upload(f, false);
          }}
        />
        <button
          type="button"
          disabled={busy}
          className={`${portalBtnPrimary} disabled:opacity-60`}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? '처리 중…' : '엑셀 선택'}
        </button>
        {preview && pendingFile ? (
          <button
            type="button"
            disabled={busy}
            className={`${portalBtnSecondary} disabled:opacity-60`}
            onClick={() => void upload(pendingFile, true)}
          >
            매칭 {preview.matched}건 반영
          </button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {preview ? (
        <div className="space-y-2 text-xs text-slate-700">
          <p>
            <span className="font-semibold">{preview.filename}</span>
            {' · '}
            {detectedLabel(preview.detected)}
            {' · '}
            총 {preview.total}줄 · 매칭 {preview.matched} · 미매칭 {preview.unmatched}
            {preview.newCount ? ` · 신규(녹색) ${preview.newCount}` : ''}
          </p>
          <div className="max-h-56 overflow-auto rounded border border-slate-200">
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">상호</th>
                  <th className="px-2 py-1.5 font-medium">품목/내역</th>
                  <th className="px-2 py-1.5 font-medium text-right">공급가</th>
                  <th className="px-2 py-1.5 font-medium">매칭</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={`${r.companyName}-${r.description}-${i}`} className="border-t border-slate-100">
                    <td className="px-2 py-1">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {r.companyName}
                        {r.isNew ? (
                          <span className="rounded bg-emerald-100 px-1 py-px text-[10px] font-bold text-emerald-800">
                            신규
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2 py-1">{r.description}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.amount.toLocaleString('ko-KR')}
                    </td>
                    <td className="px-2 py-1">
                      {r.matched ? (
                        <span className="text-emerald-700">{r.matchedCompanyName || 'OK'}</span>
                      ) : (
                        <span className="text-amber-700">미매칭</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {applyResult ? (
        <p className="text-xs text-emerald-800">
          {applyResult.filename}: 반영 {applyResult.applied} · 중복스킵 {applyResult.duplicates} ·
          미매칭 {applyResult.skipped} · 업체 {applyResult.entryCount}
        </p>
      ) : null}
    </div>
  );
}
