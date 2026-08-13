'use client';

import { useRef, useState } from 'react';

import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type { FeeLineItem } from '@/app/utils/feeBreakdown';

export type FeeImportMatch = {
  clientId: string;
  companyName: string;
  manager: string | null;
  feeSummary: number | null;
  feeItems: FeeLineItem[];
};

type ImportResult = {
  updated: number;
  invoiceBizCount: number;
  unmatchedBizNos: string[];
  skippedNoPermission: number;
  matched: FeeImportMatch[];
};

type Props = {
  onImported?: (matched: FeeImportMatch[]) => void;
  /** 인디·찰리·리아(관리자)만 업로드 가능 */
  allowed?: boolean;
};

export default function FeeInvoiceImportButton({ onImported, allowed = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) return null;

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/clients/fee-import', { method: 'POST', body: form, cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '불러오기에 실패했습니다.');
      setResult(data as ImportResult);
      onImported?.((data as ImportResult).matched ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800">세금계산서 수수료 불러오기</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            매출전자세금계산서목록 또는 국세청 대량발급 양식(품목1…). 기장·기타수수료는 ×12 합산.
            녹색(신규) 표시는 미수 가져오기에서 반영됩니다.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={e => void handleFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className={`${portalBtnPrimary} shrink-0 disabled:opacity-60`}
        >
          {loading ? '불러오는 중…' : '엑셀 선택'}
        </button>
        {result && (
          <button type="button" onClick={() => setResult(null)} className={`${portalBtnSecondary} shrink-0`}>
            닫기
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-700 space-y-1">
          <p>
            엑셀 <strong>{result.invoiceBizCount}</strong>개 사업자 중{' '}
            <strong>{result.updated}</strong>건 반영
            {result.skippedNoPermission > 0 && (
              <span className="text-amber-700">
                {' '}
                · 권한 없음 {result.skippedNoPermission}건 건너뜀
              </span>
            )}
          </p>
          {result.unmatchedBizNos.length > 0 && (
            <p className="text-slate-500">
              미매칭 사업자번호 {result.unmatchedBizNos.length}건:{' '}
              {result.unmatchedBizNos.slice(0, 8).join(', ')}
              {result.unmatchedBizNos.length > 8 ? '…' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
