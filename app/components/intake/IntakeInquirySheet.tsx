'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { INQUIRY_LIST_COLUMNS } from '@/app/config/intakeSheets';
import BlueholeCaseLink from './BlueholeCaseLink';
import IntakeInquiryDetail from './IntakeInquiryDetail';
import IntakeProcessPanel from './IntakeProcessPanel';
import {
  findProcessForInquiry,
  inquiryFieldValue,
  stubInquiryFromProcess,
  type ClientNameRef,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';

function CellValue({ row, colKey }: { row: InquiryRow; colKey: string }) {
  const raw = inquiryFieldValue(row, colKey);
  if (!raw.trim()) return <span className="text-gray-400">-</span>;
  if (colKey === 'proposedFee') return <span className="font-medium tabular-nums">{Number(raw).toLocaleString()}</span>;
  if (colKey === 'companyName') {
    return <span className="font-bold text-gray-900">{raw}</span>;
  }
  if (colKey === 'inquiryDate') {
    return <span className="text-gray-800 whitespace-nowrap tabular-nums">{raw}</span>;
  }
  if (colKey === 'blueholeCase') {
    return <BlueholeCaseLink value={raw} className="text-xs" />;
  }
  return <span className="text-gray-800">{raw}</span>;
}

export default function IntakeInquirySheet({
  rows,
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
  onLinkClient,
  onDeleteInquiry,
  deletingId,
}: {
  rows: InquiryRow[];
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
  onLinkClient?: (inquiryId: string, processId: string | null, clientId: string) => Promise<void>;
  onDeleteInquiry: (inquiry: InquiryRow, process: ProcessRow | null) => void | Promise<void>;
  deletingId: string | null;
}) {
  const [linkedProcessId, setLinkedProcessId] = useState<string | null>(forcedProcessId ?? null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    setLinkedProcessId(forcedProcessId ?? null);
  }, [selectedId, forcedProcessId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const tryScroll = (attempt = 0) => {
      if (cancelled) return;
      const row = rowRefs.current.get(selectedId);
      if (row) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (attempt < 8) {
        window.setTimeout(() => tryScroll(attempt + 1), 50 * (attempt + 1));
      }
    };
    tryScroll();
    return () => { cancelled = true; };
  }, [selectedId, rows]);

  const selectedInquiry = useMemo(
    () => rows.find(r => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const selectedProcess = useMemo(() => {
    if (!selectedInquiry) {
      if (forcedProcessId) {
        return processes.find(p => p.id === forcedProcessId) ?? null;
      }
      return null;
    }
    if (linkedProcessId) {
      const linked = processes.find(p => p.id === linkedProcessId);
      if (linked) return linked;
    }
    if (forcedProcessId) {
      const forced = processes.find(p => p.id === forcedProcessId);
      if (forced) return forced;
    }
    return findProcessForInquiry(selectedInquiry, processes, clientRefs);
  }, [selectedInquiry, processes, linkedProcessId, forcedProcessId, clientRefs]);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">유입관리 데이터 없음</p>;
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-4 items-start">
      <div className="rounded-xl border border-slate-200 bg-white min-w-0 lg:max-h-[min(70vh,calc(100dvh-8rem))] lg:overflow-y-auto lg:overflow-x-auto">
        <table className="w-full text-sm leading-relaxed min-w-[640px]">
          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
            <tr>
              {INQUIRY_LIST_COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  className={`px-3 py-2.5 text-left portal-table-head ${
                    col.key === 'inquiryDate' ? 'whitespace-nowrap' : ''
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => {
              const active = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  ref={el => {
                    if (el) rowRefs.current.set(row.id, el);
                    else rowRefs.current.delete(row.id);
                  }}
                  onClick={() => onSelect(active ? null : row.id)}
                  className={`cursor-pointer transition-colors ${
                    active ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'hover:bg-slate-50'
                  }`}
                >
                  {INQUIRY_LIST_COLUMNS.map(col => (
                    <td
                      key={col.key}
                      style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                      className={`px-3 py-2.5 align-top ${col.key === 'inquiryDate' ? 'whitespace-nowrap' : ''}`}
                    >
                      <CellValue row={row} colKey={col.key} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="min-w-0 lg:sticky lg:top-4 lg:z-10 lg:self-start lg:max-h-[min(70vh,calc(100dvh-8rem))] lg:overflow-y-auto">
        {selectedInquiry ? (
          <div className="rounded-xl border border-amber-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-amber-50 border-b border-amber-100">
              <p className="text-base font-bold text-gray-900 truncate">
                {selectedInquiry.companyName || '(미입력)'}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={deletingId === selectedInquiry.id}
                  onClick={() => void onDeleteInquiry(selectedInquiry, selectedProcess)}
                  className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === selectedInquiry.id ? '…' : '삭제'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-white"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <section className="rounded-lg border border-indigo-200 bg-indigo-50/90 p-3">
                <h3 className="text-xs font-bold text-indigo-900 mb-2">유입프로세스</h3>
                <IntakeProcessPanel
                  inquiry={selectedInquiry}
                  process={selectedProcess}
                  onProcessUpdated={onProcessUpdated}
                  onProcessCreated={row => {
                    setLinkedProcessId(row.id);
                    onProcessCreated(row);
                  }}
                  onRegisterClient={onRegisterClient}
                  onLinkClient={onLinkClient}
                  onToggleCheck={onToggleCheck}
                  onSyncBlueholeCheck={onSyncBlueholeCheck}
                  onHideChecklistItem={onHideChecklistItem}
                  onRestoreChecklist={onRestoreChecklist}
                />
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-xs font-bold text-slate-900 mb-2">상세내용</h3>
                <IntakeInquiryDetail
                  inquiry={selectedInquiry}
                  onUpdated={onInquiryUpdated}
                  compact
                />
              </section>
            </div>
          </div>
        ) : selectedProcess ? (
          <div className="rounded-xl border border-indigo-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 truncate">
                  {selectedProcess.companyName || '(미입력)'}
                </p>
                <p className="text-xs text-indigo-800 mt-0.5">연결된 유입관리 건이 없습니다</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <section className="rounded-lg border border-indigo-200 bg-indigo-50/90 p-3">
                <h3 className="text-xs font-bold text-indigo-900 mb-2">유입프로세스</h3>
                <IntakeProcessPanel
                  inquiry={stubInquiryFromProcess(selectedProcess)}
                  process={selectedProcess}
                  allowRegister
                  onProcessUpdated={onProcessUpdated}
                  onProcessCreated={row => {
                    setLinkedProcessId(row.id);
                    onProcessCreated(row);
                  }}
                  onRegisterClient={onRegisterClient}
                  onLinkClient={onLinkClient}
                  onToggleCheck={onToggleCheck}
                  onSyncBlueholeCheck={onSyncBlueholeCheck}
                  onHideChecklistItem={onHideChecklistItem}
                  onRestoreChecklist={onRestoreChecklist}
                />
              </section>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center">
            <p className="text-sm text-slate-600">왼쪽 목록에서 업체를 선택하세요</p>
            <p className="text-xs text-slate-500 mt-1">스크롤해도 오른쪽은 화면에 붙어 따라옵니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
