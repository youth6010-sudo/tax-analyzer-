'use client';

import IntakeInquirySheet from './IntakeInquirySheet';
import type { InquiryRow, ProcessRow } from './intakeUtils';

export default function IntakeSplitView({
  inquiries,
  processes,
  selectedId,
  onSelect,
  onInquiryUpdated,
  onProcessUpdated,
  onProcessCreated,
  onToggleCheck,
  onSyncBlueholeCheck,
  onRegisterClient,
  onDeleteInquiry,
  deletingId,
}: {
  inquiries: InquiryRow[];
  processes: ProcessRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onInquiryUpdated: (row: InquiryRow) => void;
  onProcessUpdated: (row: ProcessRow) => void;
  onProcessCreated: (row: ProcessRow) => void;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onSyncBlueholeCheck?: (process: ProcessRow) => void | Promise<void>;
  onRegisterClient: (inquiryId: string, processId: string | null) => Promise<string | null>;
  onDeleteInquiry: (inquiry: InquiryRow, process: ProcessRow | null) => void | Promise<void>;
  deletingId: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3 lg:p-4 shadow-sm w-full">
      <header className="mb-2">
        <h2 className="text-sm font-black text-slate-900">유입관리</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {inquiries.length}건 · 왼쪽 목록 스크롤 · 오른쪽은 화면에 붙어 따라옴
        </p>
      </header>
      <IntakeInquirySheet
        rows={inquiries}
        processes={processes}
        selectedId={selectedId}
        onSelect={onSelect}
        onInquiryUpdated={onInquiryUpdated}
        onProcessUpdated={onProcessUpdated}
        onProcessCreated={onProcessCreated}
        onToggleCheck={onToggleCheck}
        onSyncBlueholeCheck={onSyncBlueholeCheck}
        onRegisterClient={onRegisterClient}
        onDeleteInquiry={onDeleteInquiry}
        deletingId={deletingId}
      />
    </section>
  );
}
