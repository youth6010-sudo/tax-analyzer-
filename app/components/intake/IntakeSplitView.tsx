'use client';

import IntakeInquirySheet from './IntakeInquirySheet';
import type { ClientNameRef, InquiryRow, ProcessRow } from './intakeUtils';

export default function IntakeSplitView({
  inquiries,
  processes,
  selectedId,
  forcedProcessId,
  clientRefs = [],
  onSelect,
  onInquiryUpdated,
  onProcessUpdated,
  onProcessCreated,
  onToggleCheck,
  onSyncBlueholeCheck,
  onHideChecklistItem,
  onRestoreChecklist,
  onRegisterClient,
  onDeleteInquiry,
  deletingId,
}: {
  inquiries: InquiryRow[];
  processes: ProcessRow[];
  selectedId: string | null;
  forcedProcessId?: string | null;
  clientRefs?: ClientNameRef[];
  onSelect: (id: string | null) => void;
  onInquiryUpdated: (row: InquiryRow) => void;
  onProcessUpdated: (row: ProcessRow) => void;
  onProcessCreated: (row: ProcessRow) => void;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onSyncBlueholeCheck?: (process: ProcessRow) => void | Promise<void>;
  onHideChecklistItem?: (process: ProcessRow, key: string) => void | Promise<void>;
  onRestoreChecklist?: (process: ProcessRow) => void | Promise<void>;
  onRegisterClient: (inquiryId: string, processId: string | null) => Promise<string | null>;
  onDeleteInquiry: (inquiry: InquiryRow, process: ProcessRow | null) => void | Promise<void>;
  deletingId: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 lg:p-5 shadow-sm w-full">
      <header className="mb-3">
        <h2 className="text-base font-bold text-slate-900">유입관리</h2>
        <p className="text-xs text-slate-600 mt-1">
          {inquiries.length}건 · 왼쪽 목록 스크롤 · 오른쪽은 화면에 붙어 따라옴
        </p>
      </header>
      <IntakeInquirySheet
        rows={inquiries}
        processes={processes}
        selectedId={selectedId}
        forcedProcessId={forcedProcessId}
        clientRefs={clientRefs}
        onSelect={onSelect}
        onInquiryUpdated={onInquiryUpdated}
        onProcessUpdated={onProcessUpdated}
        onProcessCreated={onProcessCreated}
        onToggleCheck={onToggleCheck}
        onSyncBlueholeCheck={onSyncBlueholeCheck}
        onHideChecklistItem={onHideChecklistItem}
        onRestoreChecklist={onRestoreChecklist}
        onRegisterClient={onRegisterClient}
        onDeleteInquiry={onDeleteInquiry}
        deletingId={deletingId}
      />
    </section>
  );
}
