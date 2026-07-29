'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { INQUIRY_LIST_COLUMNS, type SheetColumn } from '@/app/config/intakeSheets';
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

const LAST_STICKY_KEY = 'companyName';
const LEFT_PCT_KEY = 'intake-inquiry-sheet-left-pct';
const MIN_LEFT_PCT = 28;
const MAX_LEFT_PCT = 72;
const DEFAULT_LEFT_PCT = 46;

function parseRemWidth(width?: string): number {
  if (!width) return 5;
  const m = width.match(/^([\d.]+)rem$/);
  return m ? parseFloat(m[1]) : 5;
}

function buildStickyLeft(columns: SheetColumn[]): Record<string, string> {
  const out: Record<string, string> = {};
  let acc = 0;
  for (const col of columns) {
    if (col.sticky) {
      out[col.key] = `${acc}rem`;
      acc += parseRemWidth(col.width);
    }
  }
  return out;
}

const STICKY_LEFT = buildStickyLeft(INQUIRY_LIST_COLUMNS);

function cellWidthStyle(col: SheetColumn) {
  if (!col.width) return undefined;
  return { width: col.width, minWidth: col.width };
}

function CellValue({ row, colKey }: { row: InquiryRow; colKey: string }) {
  const raw = inquiryFieldValue(row, colKey);
  const compact = colKey === 'consultTypes' || colKey === 'inquiryDate';
  const sizeCls = compact ? 'text-[11px] leading-tight' : '';
  if (!raw.trim()) return <span className={`text-gray-400 ${sizeCls}`}>-</span>;
  if (colKey === 'proposedFee') {
    return <span className="font-medium tabular-nums">{Number(raw).toLocaleString()}</span>;
  }
  if (colKey === 'companyName') {
    return <span className="font-semibold text-gray-900">{raw}</span>;
  }
  if (colKey === 'inquiryDate') {
    return <span className={`tabular-nums text-gray-800 ${sizeCls}`}>{raw}</span>;
  }
  if (colKey === 'consultTypes') {
    return <span className={`block text-center text-gray-800 ${sizeCls}`}>{raw}</span>;
  }
  if (colKey === 'blueholeCase') {
    return <BlueholeCaseLink value={raw} className="text-xs truncate block max-w-full" />;
  }
  return <span className="text-gray-800">{raw}</span>;
}

function clampLeftPct(n: number) {
  return Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, Math.round(n)));
}

function InquiryTable({
  rows,
  selectedId,
  rowRefs,
  onSelect,
}: {
  rows: InquiryRow[];
  selectedId: string | null;
  rowRefs: React.MutableRefObject<Map<string, HTMLTableRowElement>>;
  onSelect: (id: string | null) => void;
}) {
  return (
    <table className="w-max text-sm border-separate border-spacing-0">
      <thead className="bg-slate-50 sticky top-0 z-30 border-b border-slate-200">
        <tr>
          {INQUIRY_LIST_COLUMNS.map(col => {
            const sticky = !!col.sticky;
            const isLastSticky = col.key === LAST_STICKY_KEY;
            const compact = col.key === 'consultTypes' || col.key === 'inquiryDate';
            const center = col.key === 'consultTypes';
            return (
              <th
                key={col.key}
                style={{
                  ...cellWidthStyle(col),
                  ...(sticky ? { left: STICKY_LEFT[col.key] } : {}),
                }}
                className={[
                  center ? 'text-center' : 'text-left',
                  'portal-table-head whitespace-nowrap',
                  compact ? 'px-1 py-1.5 text-[10px]' : 'px-2 py-2',
                  sticky ? 'sticky z-30 bg-slate-50' : '',
                  isLastSticky ? 'shadow-[4px_0_6px_-4px_rgba(15,23,42,0.12)]' : '',
                ].join(' ')}
              >
                {col.label}
              </th>
            );
          })}
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
              className={`group cursor-pointer transition-colors ${
                active ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'hover:bg-slate-50'
              }`}
            >
              {INQUIRY_LIST_COLUMNS.map(col => {
                const sticky = !!col.sticky;
                const isLastSticky = col.key === LAST_STICKY_KEY;
                const compact = col.key === 'consultTypes' || col.key === 'inquiryDate';
                const center = col.key === 'consultTypes';
                const raw = inquiryFieldValue(row, col.key);
                return (
                  <td
                    key={col.key}
                    title={raw.trim() || undefined}
                    style={
                      sticky
                        ? { ...cellWidthStyle(col), left: STICKY_LEFT[col.key] }
                        : cellWidthStyle(col)
                    }
                    className={[
                      'align-middle whitespace-nowrap overflow-hidden text-ellipsis',
                      center ? 'text-center' : 'text-left',
                      compact ? 'px-1 py-1.5' : 'px-2 py-2',
                      sticky ? 'sticky z-10' : 'relative z-0',
                      sticky
                        ? active
                          ? 'bg-amber-50'
                          : 'bg-white group-hover:bg-slate-50'
                        : '',
                      !sticky && active ? 'bg-amber-50' : '',
                      isLastSticky ? 'shadow-[4px_0_6px_-4px_rgba(15,23,42,0.12)]' : '',
                    ].join(' ')}
                  >
                    <CellValue row={row} colKey={col.key} />
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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
  const [leftPct, setLeftPct] = useState(DEFAULT_LEFT_PCT);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const layoutRef = useRef<HTMLDivElement>(null);
  const leftPctLive = useRef(leftPct);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEFT_PCT_KEY);
      const n = raw != null ? Number(raw) : NaN;
      if (!Number.isNaN(n)) setLeftPct(clampLeftPct(n));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    leftPctLive.current = leftPct;
  }, [leftPct]);

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
    return () => {
      cancelled = true;
    };
  }, [selectedId, rows]);

  const onResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    const startX = e.clientX;
    const startPct = leftPctLive.current;
    const width = layoutRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientX - startX) / width) * 100;
      const next = clampLeftPct(startPct + deltaPct);
      leftPctLive.current = next;
      setLeftPct(next);
    };
    const onUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try {
        localStorage.setItem(LEFT_PCT_KEY, String(leftPctLive.current));
      } catch {
        /* ignore */
      }
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

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

  const processPanel = (inquiry: InquiryRow, process: ProcessRow | null) => (
    <IntakeProcessPanel
      inquiry={inquiry}
      process={process}
      onProcessUpdated={onProcessUpdated}
      onInquiryUpdated={onInquiryUpdated}
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
  );

  return (
    <div ref={layoutRef} className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-0">
      <div
        className="min-w-0 w-full rounded-xl border border-slate-200 bg-white overflow-x-auto overflow-y-auto lg:max-h-[min(70vh,calc(100dvh-8rem))] lg:shrink-0 max-lg:!basis-auto max-lg:!w-full"
        style={{ flex: `0 0 ${leftPct}%` }}
      >
        <InquiryTable
          rows={rows}
          selectedId={selectedId}
          rowRefs={rowRefs}
          onSelect={onSelect}
        />
      </div>

      <button
        type="button"
        aria-label="목록·상세 너비 조절"
        title="드래그해서 왼쪽·오른쪽 크기 조절"
        onPointerDown={onResizePointerDown}
        className="hidden lg:flex w-3 shrink-0 cursor-col-resize items-stretch justify-center self-stretch group"
      >
        <span className="my-8 w-1 rounded-full bg-slate-200 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500" />
      </button>

      <div className="min-w-0 w-full flex-1 lg:sticky lg:top-4 lg:z-10 lg:self-start lg:max-h-[min(70vh,calc(100dvh-8rem))] lg:overflow-y-auto">
        {selectedInquiry ? (
          <div className="rounded-xl border border-amber-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3">
              <p className="truncate text-base font-bold text-gray-900">
                {selectedInquiry.companyName || '(미입력)'}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={deletingId === selectedInquiry.id}
                  onClick={() => void onDeleteInquiry(selectedInquiry, selectedProcess)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                >
                  {deletingId === selectedInquiry.id ? '…' : '삭제'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-white hover:text-gray-900"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <section className="rounded-lg border border-indigo-200 bg-indigo-50/90 p-3">
                <h3 className="mb-2 text-xs font-bold text-indigo-900">유입프로세스</h3>
                {processPanel(selectedInquiry, selectedProcess)}
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900">상세내용 · 신규상담</h3>
                </div>
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
            <div className="flex items-center justify-between gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-gray-900">
                  {selectedProcess.companyName || '(미입력)'}
                </p>
                <p className="mt-0.5 text-xs text-indigo-800">연결된 유입관리 건이 없습니다</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <section className="rounded-lg border border-indigo-200 bg-indigo-50/90 p-3">
                <h3 className="mb-2 text-xs font-bold text-indigo-900">유입프로세스</h3>
                {processPanel(stubInquiryFromProcess(selectedProcess), selectedProcess)}
              </section>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center">
            <p className="text-sm text-slate-600">왼쪽 목록에서 업체를 선택하세요</p>
            <p className="mt-1 text-xs text-slate-500">가운데 선을 드래그하면 좌·우 크기를 조절할 수 있습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
