'use client';

import Link from 'next/link';
import ClientIncomeTypesPanel from '@/app/components/clients/ClientIncomeTypesPanel';

type Props = {
  clientId: string;
  companyName: string;
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function ClientFilingSettingsModal({
  clientId,
  companyName,
  canEdit = true,
  onClose,
  onSaved,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800">{companyName}</h2>
            <p className="text-xs text-slate-500">간이지급명세서 · 연말정산지급명세서 신고대상</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            닫기
          </button>
        </div>
        <div className="mb-3">
          <Link
            href={`/clients/${clientId}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            수임처 상세보기 →
          </Link>
        </div>
        <ClientIncomeTypesPanel
          clientId={clientId}
          canEdit={canEdit}
          compact
          onSaved={() => {
            onSaved?.();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
