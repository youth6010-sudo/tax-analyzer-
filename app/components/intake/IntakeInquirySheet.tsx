'use client';

import { useEffect, useMemo, useState } from 'react';
import { INQUIRY_LIST_COLUMNS } from '@/app/config/intakeSheets';
import BlueholeCaseLink from './BlueholeCaseLink';
import IntakeInquiryDetail from './IntakeInquiryDetail';
import IntakeProcessPanel from './IntakeProcessPanel';
import {
  findProcessForInquiry,
  inquiryFieldValue,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';

function CellValue({ row, colKey }: { row: InquiryRow; colKey: string }) {
  const raw = inquiryFieldValue(row, colKey);
  if (colKey === 'blueholeCase') {
    return raw.trim()
      ? <BlueholeCaseLink value={raw} className="text-sm" />
      : <span className="text-gray-300">-</span>;
  }
  if (!raw.trim()) return <span className="text-gray-300">-</span>;
  if (colKey === 'proposedFee') return <span className="font-medium tabular-nums">{Number(raw).toLocaleString()}</span>;
  if (colKey === 'companyName') {
    return <span className="font-bold text-gray-900">{raw}</span>;
  }
  return <span className="text-gray-800">{raw}</span>;
}

export default function IntakeInquirySheet({
  rows,
  processes,
  selectedId,
  onSelect,
  onInquiryUpdated,
  onProcessUpdated,
  onProcessCreated,
  onToggleCheck,
  onRegisterClient,
  savingId,
}: {
  rows: InquiryRow[];
  processes: ProcessRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onInquiryUpdated: (row: InquiryRow) => void;
  onProcessUpdated: (row: ProcessRow) => void;
  onProcessCreated: (row: ProcessRow) => void;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onRegisterClient: (inquiryId: string, processId: string | null) => Promise<string | null>;
  savingId: string | null;
}) {
  const [linkedProcessId, setLinkedProcessId] = useState<string | null>(null);

  useEffect(() => {
    setLinkedProcessId(null);
  }, [selectedId]);

  const selectedInquiry = useMemo(
    () => rows.find(r => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const selectedProcess = useMemo(() => {
    if (!selectedInquiry) return null;
    if (linkedProcessId) {
      const linked = processes.find(p => p.id === linkedProcessId);
      if (linked) return linked;
    }
    return findProcessForInquiry(selectedInquiry, processes);
  }, [selectedInquiry, processes, linkedProcessId]);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">유입관리 데이터 없음</p>;
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-3 items-start">
      <div className="rounded-lg border border-slate-200/80 bg-white/90 min-w-0 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:overflow-x-auto">
        <table className="w-full text-sm leading-snug min-w-[640px]">
          <thead className="bg-slate-100 sticky top-0 z-10 shadow-[0_1px_0_0_rgb(226_232_240)]">
            <tr>
              {INQUIRY_LIST_COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="px-2.5 py-2 text-left text-xs font-bold text-slate-700 border-b border-slate-200"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(row => {
              const active = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(active ? null : row.id)}
                  className={`cursor-pointer transition-colors ${
                    active ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'hover:bg-slate-50'
                  }`}
                >
                  {INQUIRY_LIST_COLUMNS.map(col => (
                    <td key={col.key} className="px-2.5 py-2 align-top">
                      <CellValue row={row} colKey={col.key} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="min-w-0 lg:sticky lg:top-[8.75rem] lg:z-20 lg:self-start lg:max-h-[calc(100dvh-9.25rem)] lg:overflow-y-auto">
        {selectedInquiry ? (
          <div className="rounded-xl border border-amber-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-b border-amber-100">
              <p className="text-sm font-black text-gray-900 truncate">
                {selectedInquiry.companyName || '(미입력)'}
              </p>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="shrink-0 text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-white"
              >
                닫기
              </button>
            </div>
            <div className="flex flex-col gap-2.5 p-2.5">
              <section className="rounded-lg border border-indigo-200/60 bg-indigo-50/80 p-2.5">
                <h3 className="text-[11px] font-black text-indigo-900 mb-1.5">유입프로세스</h3>
                <IntakeProcessPanel
                  inquiry={selectedInquiry}
                  process={selectedProcess}
                  onToggleCheck={onToggleCheck}
                  onProcessUpdated={onProcessUpdated}
                  onProcessCreated={row => {
                    setLinkedProcessId(row.id);
                    onProcessCreated(row);
                  }}
                  onRegisterClient={onRegisterClient}
                  onInquiryUpdated={onInquiryUpdated}
                  savingId={savingId}
                />
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-2.5">
                <h3 className="text-[11px] font-black text-slate-900 mb-1.5">상세내용</h3>
                <IntakeInquiryDetail
                  inquiry={selectedInquiry}
                  onUpdated={onInquiryUpdated}
                  compact
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
