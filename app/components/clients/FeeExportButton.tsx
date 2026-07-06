'use client';

import { useState } from 'react';

import { portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type { ClientRecord } from '@/app/types/client';
import { downloadFeeExportExcel } from '@/app/utils/feeExport';

type Props = {
  clients: ClientRecord[];
};

export default function FeeExportButton({ clients }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      await downloadFeeExportExcel(clients);
    } catch {
      alert('엑셀 내려받기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800">수수료 엑셀 내려받기</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            담당자·업체명·기장수수료·기타수수료·조정료·합계(연환산) 열 구조
          </p>
        </div>
        <button
          type="button"
          disabled={loading || clients.length === 0}
          onClick={() => void handleDownload()}
          className={`${portalBtnSecondary} shrink-0 disabled:opacity-60`}
        >
          {loading ? '생성 중…' : '엑셀 내려받기'}
        </button>
      </div>
    </div>
  );
}
