'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ManagerMultiFilter from '@/app/components/portal/ManagerMultiFilter';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalMain,
} from '@/app/components/portal/uiClasses';
import ArrearsHubTabs from '@/app/arrears/ArrearsHubTabs';
import BondAttachmentModal from '@/app/arrears/bond/BondAttachmentModal';
import { useArrearsChurnStatuses } from '@/app/arrears/useArrearsChurnStatuses';
import CertifiedLetterModal from '@/app/arrears/bond/CertifiedLetterModal';
import BondHistoryModal from '@/app/arrears/bond/BondHistoryModal';
import DismissalNoticeModal from '@/app/arrears/bond/DismissalNoticeModal';
import { addDaysIso } from '@/app/arrears/bond/DismissalNoticeSheet';
import { useColumnWidths } from '@/app/components/portal/useColumnWidths';
import {
  arrearsChurnStatusChipClass,
  arrearsChurnStatusLabel,
  type ArrearsEntryDto,
} from '@/app/types/arrears';
import {
  BOND_STAFF_CONTACTS,
  bondContactForManager,
  DEFAULT_BOND_CONTACT,
  dismissalNoticeKind,
  type BondNoticeDefaults,
  type BondNoticeEdit,
  type BondNoticeDefaultsLogEntry,
  emptyBondRecord,
  paymentOrderAllowed,
  type BondContact,
  type BondDocLogEntry,
  todayIsoDate,
  type BondAttachment,
  type BondAttachmentStepKey,
  type BondCheckedStepKey,
  type BondRecord,
  type BondRecordPatch,
  type BondStoredRecord,
} from '@/app/types/bond';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import { generateDocument, isDocumentReady, type DocumentType } from '@/lib/documents/generateDocument';

/** 미수관리 관리분류 「채권회수」 업체가 채권관리 대상 */
const BOND_CATEGORY = 'recovery';

function toRecord(e: ArrearsEntryDto, stored: BondStoredRecord | undefined): BondRecord {
  const base = emptyBondRecord(e.id, e.managerName || '', e.companyName);
  if (!stored) return base;
  const att = stored.attachments ?? {};
  return {
    ...base,
    내용증명: { ...base.내용증명, ...stored.내용증명, attachments: att.내용증명 ?? [] },
    배달증명: { ...base.배달증명, ...stored.배달증명, attachments: att.배달증명 ?? [] },
    회수일정: stored.회수일정 ?? '',
    회수일정첨부: att.회수일정 ?? [],
    해임통보: { ...base.해임통보, ...stored.해임통보, attachments: att.해임통보 ?? [] },
    지급명령: { ...base.지급명령, ...stored.지급명령, attachments: att.지급명령 ?? [] },
    recipient: stored.recipient,
  };
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h4.09a1.5 1.5 0 0 1 1.06.44L9.7 5.5h6.8A1.5 1.5 0 0 1 18 7v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5v-9Z" />
    </svg>
  );
}

function AttachButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="첨부파일"
      className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
        count ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'
      }`}
    >
      <FolderIcon />
      {count ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-4 text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function GenerateButton({
  enabled,
  onClick,
  disabledTitle = '준비중',
}: {
  enabled: boolean;
  onClick: () => void;
  disabledTitle?: string;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      title={enabled ? '서식 생성' : disabledTitle}
      className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
    >
      서식생성
    </button>
  );
}

const CHURN_NONE = '__none__';
const DATE_SET = '__set__';
const DATE_UNSET = '__unset__';
const SCHEDULE_EMPTY = '__empty__';

/** 선택값: 날짜 있음 · 날짜 없음 · YYYY-MM(월) · YYYY-MM-DD(일). 빈 배열 = 전체 */
function matchesDateFilter(date: string, filter: string[]): boolean {
  if (!filter.length) return true;
  return filter.some(f => {
    if (f === DATE_SET) return !!date;
    if (f === DATE_UNSET) return !date;
    return !!date && date.startsWith(f);
  });
}

const DELIVERY_RETURNED = '__returned__';

/** 배달증명 필터 — 「반송」 선택은 날짜 조건과 OR */
function matchesDeliveryFilter(step: { date: string; returned?: boolean }, filter: string[]): boolean {
  if (!filter.length) return true;
  if (filter.includes(DELIVERY_RETURNED) && step.returned) return true;
  const dates = filter.filter(f => f !== DELIVERY_RETURNED);
  return dates.length > 0 && matchesDateFilter(step.date, dates);
}

function formatDateOption(v: string): string {
  if (v === DELIVERY_RETURNED) return '반송';
  if (v === DATE_SET) return '날짜 있음';
  if (v === DATE_UNSET) return '날짜 없음';
  if (v.length === 7) return `${v.slice(0, 4)}년 ${Number(v.slice(5))}월 전체`;
  return v.replace(/-/g, '.');
}

function formatScheduleOption(v: string): string {
  return v === SCHEDULE_EMPTY ? '(비어있음)' : v;
}

/** 열 구분선 */
const COL_BORDER = 'border-r border-slate-200 last:border-r-0';
const TH = `relative whitespace-nowrap px-2 py-2.5 text-center align-middle ${COL_BORDER}`;

const BOND_COLUMNS = ['select', 'manager', 'company', 'cert', 'delivery', 'dismiss', 'schedule', 'order'] as const;

function attachmentsOf(r: BondRecord, step: BondAttachmentStepKey): BondAttachment[] {
  return step === '회수일정' ? r.회수일정첨부 : (r[step].attachments ?? []);
}
const BOND_COL_WIDTHS_KEY = 'bondMgmt.colWidths.v2';
const TD = `px-1.5 py-1.5 text-center ${COL_BORDER}`;

function Cell({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center gap-1">{children}</div>;
}

export default function BondMgmtPanel() {
  const [entries, setEntries] = useState<ArrearsEntryDto[]>([]);
  const [stored, setStored] = useState<Record<string, BondStoredRecord>>({});
  const [canManage, setCanManage] = useState(false);
  const [viewerName, setViewerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [managerFilter, setManagerFilter] = useState<string[]>([]);
  const [certFilter, setCertFilter] = useState<string[]>([]);
  const [deliveryFilter, setDeliveryFilter] = useState<string[]>([]);
  const [dismissFilter, setDismissFilter] = useState<string[]>([]);
  const [orderFilter, setOrderFilter] = useState<string[]>([]);
  const [scheduleFilter, setScheduleFilter] = useState<string[]>([]);
  const [churnFilter, setChurnFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStep, setBulkStep] = useState<BondCheckedStepKey>('내용증명');
  const [bulkDate, setBulkDate] = useState(todayIsoDate());
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  const [attachTarget, setAttachTarget] = useState<{ id: string; step: BondAttachmentStepKey } | null>(null);
  const [certTargetId, setCertTargetId] = useState<string | null>(null);
  const [dismissTargetId, setDismissTargetId] = useState<string | null>(null);
  const [contact, setContact] = useState<BondContact>(DEFAULT_BOND_CONTACT);
  const [contacts, setContacts] = useState<BondContact[]>(BOND_STAFF_CONTACTS);
  const [nextDocNo, setNextDocNo] = useState('');
  const [editNotice, setEditNotice] = useState<BondNoticeEdit | null>(null);
  const [docLog, setDocLog] = useState<BondDocLogEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [noticeDefaults, setNoticeDefaults] = useState<BondNoticeDefaults>({ sentDate: '', deadline: '' });
  /** 입력 중인 일괄 날짜 — 「저장」 전에는 안내문에 쓰지 않음 */
  const [defaultsDraft, setDefaultsDraft] = useState<BondNoticeDefaults | null>(null);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsError, setDefaultsError] = useState('');
  const [defaultsLog, setDefaultsLog] = useState<BondNoticeDefaultsLogEntry[]>([]);
  const cols = useColumnWidths(BOND_COL_WIDTHS_KEY, BOND_COLUMNS);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  /** 검색칸 = 표 왼쪽 ~ 내용증명 열 끝 (배달증명 열 시작 전) */
  const [searchWidth, setSearchWidth] = useState<number | null>(null);
  useEffect(() => {
    const table = tableRef.current;
    const bar = toolbarRef.current;
    if (!table || !bar) return;
    const measure = () => {
      const th = table.querySelector<HTMLElement>('thead th[data-col="delivery"]');
      if (!th) return;
      const w = Math.round(th.getBoundingClientRect().left - bar.getBoundingClientRect().left - 8);
      setSearchWidth(w >= 240 ? w : null);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    ro.observe(bar);
    table.querySelectorAll('thead th').forEach(th => ro.observe(th));
    return () => ro.disconnect();
  }, []);
  const noticeDatesReady = !!noticeDefaults.sentDate && !!noticeDefaults.deadline;

  const applyBondPayload = useCallback((data: unknown) => {
    const d = data as {
      noticeDefaults?: BondNoticeDefaults;
      noticeDefaultsLog?: BondNoticeDefaultsLogEntry[];
      records?: Record<string, BondStoredRecord>;
      contact?: BondContact;
      contacts?: BondContact[];
      nextDocNo?: string;
      docLog?: BondDocLogEntry[];
    };
    if (d.docLog) setDocLog(d.docLog);
    if (d.noticeDefaults) setNoticeDefaults(d.noticeDefaults);
    if (d.noticeDefaultsLog) setDefaultsLog(d.noticeDefaultsLog);
    if (d.records) setStored(d.records);
    if (d.contact) setContact(d.contact);
    if (d.contacts?.length) setContacts(d.contacts);
    if (d.nextDocNo) setNextDocNo(d.nextDocNo);
  }, []);

  const saveNoticeDefaults = async (next: BondNoticeDefaults) => {
    if (next.sentDate && next.deadline && next.deadline < next.sentDate) {
      setDefaultsError('입금기한이 발신일보다 빠릅니다.');
      return;
    }
    setDefaultsSaving(true);
    setDefaultsError('');
    try {
      const res = await fetch('/api/arrears/bond', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noticeDefaults: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || '저장 실패');
      applyBondPayload(d);
      setDefaultsDraft(null);
    } catch (e) {
      setDefaultsError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setDefaultsSaving(false);
    }
  };
  const suggestedDefaults: BondNoticeDefaults = noticeDatesReady
    ? noticeDefaults
    : { sentDate: todayIsoDate(), deadline: addDaysIso(todayIsoDate(), 7) };
  const shownDefaults = defaultsDraft ?? suggestedDefaults;
  const defaultsDirty =
    !noticeDatesReady ||
    shownDefaults.sentDate !== noticeDefaults.sentDate ||
    shownDefaults.deadline !== noticeDefaults.deadline;
  const savedStamp = noticeDefaults.savedAt
    ? `${noticeDefaults.savedBy || '?'} · ${new Date(noticeDefaults.savedAt).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })} 저장`
    : '';

  const [reloadTick, setReloadTick] = useState(0);
  const load = useCallback(() => setReloadTick(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.append('category', BOND_CATEGORY);
    const readJson = (res: Response) =>
      res.json().catch(() => ({})).then(data => {
        if (!res.ok) throw new Error((data as { error?: string }).error || '조회 실패');
        return data;
      });
    Promise.all([
      fetchWithTimeout(`/api/arrears?${params.toString()}`, { cache: 'no-store' }, 20_000).then(readJson),
      fetchWithTimeout('/api/arrears/bond', { cache: 'no-store' }, 20_000).then(readJson),
    ])
      .then(([list, bond]) => {
        if (cancelled) return;
        setError('');
        setEntries((list as { items?: ArrearsEntryDto[] }).items || []);
        setCanManage(!!(list as { canManage?: boolean }).canManage);
        setViewerName((list as { viewerName?: string }).viewerName?.trim() || '');
        applyBondPayload(bond);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick, applyBondPayload]);

  const companyNames = useMemo(() => new Map(entries.map(e => [e.id, e.companyName])), [entries]);
  const churnById = useMemo(() => new Map(entries.map(e => [e.id, e.churnMgmtStatus || ''])), [entries]);
  /** 미수관리 수정 모드에서 편집한 해임 구분 이름·색 */
  const churnOptions = useArrearsChurnStatuses();
  const churnLabelOf = useCallback(
    (id: string) => (churnById.get(id) ? arrearsChurnStatusLabel(churnById.get(id)!, churnOptions) : ''),
    [churnById, churnOptions],
  );
  const churnFilterOptions = useMemo(() => [CHURN_NONE, ...churnOptions.map(o => o.id)], [churnOptions]);
  const formatChurnOption = useCallback(
    (v: string) => (v === CHURN_NONE ? '(미지정)' : arrearsChurnStatusLabel(v, churnOptions) || v),
    [churnOptions],
  );

  const managerOptions = useMemo(
    () =>
      [...new Set(entries.map(e => e.managerName?.trim()).filter((n): n is string => !!n))].sort((a, b) =>
        a.localeCompare(b, 'ko'),
      ),
    [entries],
  );

  const allRows = useMemo(
    () => entries.map(e => toRecord(e, stored[e.id])),
    [entries, stored],
  );

  const dateOptionsOf = useCallback(
    (pick: (r: BondRecord) => string) => {
      const dates = allRows.map(pick).filter(Boolean);
      const months = [...new Set(dates.map(d => d.slice(0, 7)))].sort().reverse();
      const days = [...new Set(dates)].sort().reverse();
      return [DATE_SET, DATE_UNSET, ...months, ...days];
    },
    [allRows],
  );

  const scheduleOptions = useMemo(() => {
    const vals = [...new Set(allRows.map(r => r.회수일정.trim()).filter(Boolean))];
    vals.sort((a, b) => a.localeCompare(b, 'ko'));
    return [SCHEDULE_EMPTY, ...vals];
  }, [allRows]);

  const rows = useMemo(() => {
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const qn = norm(companyQuery);
    return allRows.filter(
      r =>
        (!managerFilter.length || managerFilter.some(m => managerNamesMatch(r.담당자명, m))) &&
        (!qn || norm(r.업체명).includes(qn)) &&
        (!churnFilter.length || churnFilter.includes(churnById.get(r.id) || CHURN_NONE)) &&
        (!scheduleFilter.length ||
          scheduleFilter.includes(r.회수일정.trim() || SCHEDULE_EMPTY)) &&
        matchesDateFilter(r.내용증명.date, certFilter) &&
        matchesDeliveryFilter(r.배달증명, deliveryFilter) &&
        matchesDateFilter(r.해임통보.date, dismissFilter) &&
        matchesDateFilter(r.지급명령.date, orderFilter),
    );
  }, [
    allRows,
    managerFilter,
    companyQuery,
    churnFilter,
    churnById,
    scheduleFilter,
    certFilter,
    deliveryFilter,
    dismissFilter,
    orderFilter,
  ]);

  const canEditRow = useCallback(
    (r: BondRecord) => canManage || managerNamesMatch(r.담당자명, viewerName),
    [canManage, viewerName],
  );

  const save = useCallback(async (updates: Array<{ id: string; patch: BondRecordPatch }>) => {
    if (!updates.length) return;
    setStored(prev => {
      const next = { ...prev };
      for (const { id, patch } of updates) {
        const prevRec = next[id];
        next[id] = { ...prevRec, ...patch };
        if (patch.해임통보) next[id].해임통보 = { ...prevRec?.해임통보, ...patch.해임통보 };
        if (patch.배달증명) {
          next[id].배달증명 = {
            ...patch.배달증명,
            returned: patch.배달증명.returned ?? prevRec?.배달증명?.returned,
          };
        }
      }
      return next;
    });
    try {
      const res = await fetch('/api/arrears/bond', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      applyBondPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
      load();
    }
  }, [load, applyBondPayload]);

  const setCheck = (r: BondRecord, step: BondCheckedStepKey, checked: boolean) =>
    void save([{ id: r.id, patch: { [step]: { checked, date: checked ? r[step].date || todayIsoDate() : '' } } }]);

  const setStepDate = (r: BondRecord, step: BondCheckedStepKey, date: string) =>
    void save([{ id: r.id, patch: { [step]: { checked: !!date, date } } }]);

  const applyBulk = () => {
    const targets = rows.filter(
      r =>
        selected.has(r.id) &&
        canEditRow(r) &&
        (bulkStep !== '지급명령' || paymentOrderAllowed(churnLabelOf(r.id))),
    );
    if (!targets.length) return;
    void save(targets.map(r => ({ id: r.id, patch: { [bulkStep]: { checked: !!bulkDate, date: bulkDate } } })));
  };

  const commitMemo = (r: BondRecord) => {
    const draft = memoDrafts[r.id];
    if (draft === undefined || draft === r.회수일정) return;
    void save([{ id: r.id, patch: { 회수일정: draft } }]);
    setMemoDrafts(prev => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
  };

  const handleGenerate = (type: DocumentType, r: BondRecord) => {
    if (type === '내용증명') {
      setCertTargetId(r.id);
      return;
    }
    if (type === '해임통보') {
      if (noticeDatesReady && dismissalNoticeKind(churnLabelOf(r.id))) setDismissTargetId(r.id);
      return;
    }
    try {
      generateDocument({ type, ...r });
    } catch {
      window.alert(`${type} 서식 연결 준비 중입니다.`);
    }
  };

  const editableRows = rows.filter(canEditRow);
  const allSelected = editableRows.length > 0 && editableRows.every(r => selected.has(r.id));
  const attachRow = attachTarget ? allRows.find(r => r.id === attachTarget.id) : null;
  const certEntry = certTargetId ? entries.find(e => e.id === certTargetId) : null;
  const certRow = certTargetId ? allRows.find(r => r.id === certTargetId) : null;
  const dismissEntry = dismissTargetId ? entries.find(e => e.id === dismissTargetId) : null;
  const dismissRow = dismissTargetId ? allRows.find(r => r.id === dismissTargetId) : null;
  const editEntry = editNotice ? entries.find(e => e.id === editNotice.entryId) : null;
  const editRow = editNotice ? allRows.find(r => r.id === editNotice.entryId) : null;

  const checkedStepCell = (r: BondRecord, step: BondCheckedStepKey) => {
    const label = churnLabelOf(r.id);
    const locked = step === '지급명령' && !paymentOrderAllowed(label);
    const editable = canEditRow(r) && !locked;
    const docType: DocumentType | null = step === '배달증명' ? null : step;
    const generateEnabled = !!docType && isDocumentReady(docType) && editable;
    return (
      <div
        className={locked ? 'opacity-40' : undefined}
        title={locked ? `지급명령은 해임 구분이 기장·해임인 업체만 진행합니다 (현재: ${label || '미지정'})` : undefined}
      >
      <Cell>
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={r[step].checked}
          disabled={!editable}
          onChange={e => setCheck(r, step, e.target.checked)}
        />
        <input
          type="date"
          className={`${portalInput} w-[6.9rem] px-1 py-0.5 text-[11px]`}
          value={r[step].date}
          disabled={!editable}
          onChange={e => setStepDate(r, step, e.target.value)}
        />
        {step === '배달증명' ? (
          <label
            className={`flex shrink-0 items-center gap-0.5 rounded border px-1 py-0.5 text-[11px] font-semibold ${
              r.배달증명.returned
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
            title="우편물 반송 — 날짜칸에는 반송일을 기록"
          >
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={!!r.배달증명.returned}
              disabled={!editable}
              onChange={e =>
                void save([
                  {
                    id: r.id,
                    patch: { 배달증명: { checked: r.배달증명.checked, date: r.배달증명.date, returned: e.target.checked } },
                  },
                ])
              }
            />
            반송
          </label>
        ) : null}
        <AttachButton
          count={r[step].attachments.length}
          onClick={() => {
            if (!locked) setAttachTarget({ id: r.id, step });
          }}
        />
        {docType && isDocumentReady(docType) ? (
          <GenerateButton
            enabled={generateEnabled}
            onClick={() => handleGenerate(docType, r)}
            disabledTitle={locked ? '기장·해임 업체만 진행' : '준비중'}
          />
        ) : null}
      </Cell>
      </div>
    );
  };

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full space-y-4 py-4`}>
        <ArrearsHubTabs active="bond" />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">채권관리</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              미수관리에서 관리분류가 「채권회수」인 업체가 자동으로 표시됩니다. 담당자·업체명은 미수관리 기준입니다.
            </p>
          </div>
        </div>

        <div ref={toolbarRef} className="flex flex-wrap items-center gap-2">
          <label
            style={searchWidth ? { width: searchWidth } : undefined}
            className="flex w-80 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
          >
            <span className="shrink-0 text-xs font-semibold text-slate-500">검색</span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
              placeholder="거래처명"
              value={companyQuery}
              onChange={e => setCompanyQuery(e.target.value)}
            />
          </label>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600"
              title={
                canManage
                  ? '해임통보 안내문의 기본 발신일자·입금기한 (각 담당이 안내문 생성 화면에서 바꿀 수 있음)'
                  : '관리자가 지정한 일괄 날짜 — 안내문 생성 화면에서 바꿀 수 있음'
              }
            >
              <span className="font-semibold text-slate-500">해임통보 일괄</span>
              <label className="flex items-center gap-1">
                발신일
                <input
                  type="date"
                  className="h-7 rounded border border-slate-300 px-1 text-xs disabled:bg-slate-50"
                  value={shownDefaults.sentDate}
                  disabled={!canManage || defaultsSaving}
                  onChange={e => setDefaultsDraft({ ...shownDefaults, sentDate: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1">
                입금기한
                <input
                  type="date"
                  className="h-7 rounded border border-slate-300 px-1 text-xs disabled:bg-slate-50"
                  value={shownDefaults.deadline}
                  disabled={!canManage || defaultsSaving}
                  onChange={e => setDefaultsDraft({ ...shownDefaults, deadline: e.target.value })}
                />
              </label>
              {canManage ? (
                <button
                  type="button"
                  className="h-7 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white disabled:bg-slate-300"
                  disabled={defaultsSaving || !shownDefaults.sentDate || !shownDefaults.deadline}
                  onClick={() => void saveNoticeDefaults(shownDefaults)}
                >
                  {defaultsSaving ? '저장 중…' : '저장'}
                </button>
              ) : null}
              {defaultsError ? (
                <span className="text-rose-600">{defaultsError}</span>
              ) : !noticeDatesReady ? (
                <span className="text-amber-600">저장 전 · 해임통보 생성 불가</span>
              ) : defaultsDirty ? (
                <span className="text-amber-600">변경 저장 전</span>
              ) : (
                <span className="text-slate-500">{savedStamp || '저장됨 (저장자 기록 없음)'}</span>
              )}
            </div>
            <button
              type="button"
              className={`${portalBtnSecondary} whitespace-nowrap`}
              onClick={() => setHistoryOpen(true)}
              title="내용증명·해임통보·회수일정·지급명령 변경 이력, 발급 대장, 일괄 날짜 이력"
            >
              이력관리
            </button>
            {cols.customized ? (
              <button
                type="button"
                className={`${portalBtnSecondary} ml-auto whitespace-nowrap`}
                onClick={cols.reset}
                title="이 컴퓨터에서 조절한 열 너비를 원래대로"
              >
                열 너비 초기화
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className={portalAlertError}>{error}</p> : null}

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm">
            <span className="font-semibold text-blue-900">{selected.size}개 선택</span>
            <select
              className={`${portalInput} w-auto py-1 text-xs`}
              value={bulkStep}
              onChange={e => setBulkStep(e.target.value as BondCheckedStepKey)}
            >
              <option value="내용증명">내용증명</option>
              <option value="배달증명">배달증명</option>
              <option value="지급명령">지급명령</option>
            </select>
            <input
              type="date"
              className={`${portalInput} w-auto py-1 text-xs`}
              value={bulkDate}
              onChange={e => setBulkDate(e.target.value)}
            />
            <button type="button" className={portalBtnPrimary} onClick={applyBulk}>
              {bulkDate ? '날짜 일괄 변경' : '날짜 일괄 삭제'}
            </button>
            <button type="button" className={portalBtnSecondary} onClick={() => setSelected(new Set())}>
              선택 해제
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table
            ref={tableRef}
            style={cols.tableStyle}
            className={`w-full text-sm ${cols.customized ? '[&_td]:overflow-hidden' : ''}`}
          >
            <thead className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-slate-800">
              <tr>
                <th {...cols.thProps('select')} className={`relative w-8 px-1.5 py-2.5 text-center align-middle ${COL_BORDER}`}>
                  {cols.handle('select')}
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={allSelected}
                    disabled={!editableRows.length}
                    onChange={e =>
                      setSelected(e.target.checked ? new Set(editableRows.map(r => r.id)) : new Set())
                    }
                  />
                </th>
                <th {...cols.thProps('manager')} className={`${TH} w-20`}>
                  {cols.handle('manager')}
                  <ManagerMultiFilter
                    headerLabel="담당자명"
                    options={managerOptions}
                    value={managerFilter}
                    onChange={setManagerFilter}
                  />
                </th>
                <th {...cols.thProps('company')} className={`${TH} w-48`}>
                  {cols.handle('company')}
                  <div className="inline-flex items-center gap-3">
                    <span>거래처명</span>
                    <span className="text-xs font-semibold text-slate-600">
                      <ManagerMultiFilter
                        headerLabel="해임"
                        options={churnFilterOptions}
                        value={churnFilter}
                        onChange={setChurnFilter}
                        formatOption={formatChurnOption}
                      />
                    </span>
                  </div>
                </th>
                <th {...cols.thProps('cert')} className={TH}>
                  {cols.handle('cert')}
                  <ManagerMultiFilter
                    headerLabel="내용증명"
                    options={dateOptionsOf(r => r.내용증명.date)}
                    value={certFilter}
                    onChange={setCertFilter}
                    formatOption={formatDateOption}
                    searchable
                  />
                </th>
                <th {...cols.thProps('delivery')} className={TH}>
                  {cols.handle('delivery')}
                  <ManagerMultiFilter
                    headerLabel="배달증명"
                    options={[DELIVERY_RETURNED, ...dateOptionsOf(r => r.배달증명.date)]}
                    value={deliveryFilter}
                    onChange={setDeliveryFilter}
                    formatOption={formatDateOption}
                    searchable
                  />
                </th>
                <th {...cols.thProps('dismiss')} className={TH}>
                  {cols.handle('dismiss')}
                  <ManagerMultiFilter
                    headerLabel="해임통보"
                    options={dateOptionsOf(r => r.해임통보.date)}
                    value={dismissFilter}
                    onChange={setDismissFilter}
                    formatOption={formatDateOption}
                    searchable
                    align="right"
                  />
                </th>
                <th {...cols.thProps('schedule')} className={TH}>
                  {cols.handle('schedule')}
                  <ManagerMultiFilter
                    headerLabel="회수일정"
                    options={scheduleOptions}
                    value={scheduleFilter}
                    onChange={setScheduleFilter}
                    formatOption={formatScheduleOption}
                    searchable
                    align="right"
                  />
                </th>
                <th {...cols.thProps('order')} className={TH}>
                  {cols.handle('order')}
                  <ManagerMultiFilter
                    headerLabel="지급명령"
                    options={dateOptionsOf(r => r.지급명령.date)}
                    value={orderFilter}
                    onChange={setOrderFilter}
                    formatOption={formatDateOption}
                    searchable
                    align="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    {entries.length ? '조건에 맞는 업체가 없습니다.' : '채권회수로 분류된 업체가 없습니다.'}
                  </td>
                </tr>
              ) : (
                rows.map(r => {
                  const editable = canEditRow(r);
                  return (
                    <tr key={r.id} className="align-middle">
                      <td className={TD}>
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={selected.has(r.id)}
                          disabled={!editable}
                          onChange={e =>
                            setSelected(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className={`${TD} whitespace-nowrap text-slate-700`}>{r.담당자명 || '-'}</td>
                      <td className={`${TD} whitespace-nowrap font-medium text-slate-900`}>
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{r.업체명}</span>
                          {churnById.get(r.id) ? (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${arrearsChurnStatusChipClass(churnById.get(r.id)!, churnOptions)}`}
                              title="미수관리 해임 상태"
                            >
                              {arrearsChurnStatusLabel(churnById.get(r.id)!, churnOptions)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={TD}>{checkedStepCell(r, '내용증명')}</td>
                      <td className={TD}>{checkedStepCell(r, '배달증명')}</td>
                      <td className={TD}>
                        <Cell>
                          <input
                            type="date"
                            className={`${portalInput} w-[6.9rem] px-1 py-0.5 text-[11px]`}
                            value={r.해임통보.date}
                            disabled={!editable}
                            onChange={e => void save([{ id: r.id, patch: { 해임통보: { date: e.target.value } } }])}
                          />
                          <AttachButton
                            count={r.해임통보.attachments?.length ?? 0}
                            onClick={() => setAttachTarget({ id: r.id, step: '해임통보' })}
                          />
                          <GenerateButton
                            enabled={
                              isDocumentReady('해임통보') &&
                              editable &&
                              noticeDatesReady &&
                              !!dismissalNoticeKind(churnLabelOf(r.id))
                            }
                            onClick={() => handleGenerate('해임통보', r)}
                            disabledTitle={
                              !dismissalNoticeKind(churnLabelOf(r.id))
                                ? `해임 구분이 유예·기장인 업체만 해임통보 공문을 만듭니다 (현재: ${churnLabelOf(r.id) || '미지정'})`
                                : !noticeDatesReady
                                  ? '상단 「해임통보 일괄」 발신일·입금기한을 저장해야 생성할 수 있습니다'
                                  : '권한 없음'
                            }
                          />
                        </Cell>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-1">
                          <input
                            className={`${portalInput} w-full min-w-[6rem] px-1.5 py-0.5 text-[11px]`}
                            placeholder="협의한 회수 일정 메모"
                            value={memoDrafts[r.id] ?? r.회수일정}
                            disabled={!editable}
                            onChange={e => setMemoDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                            onBlur={() => commitMemo(r)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                          />
                          <AttachButton
                            count={r.회수일정첨부.length}
                            onClick={() => setAttachTarget({ id: r.id, step: '회수일정' })}
                          />
                        </div>
                      </td>
                      <td className={TD}>{checkedStepCell(r, '지급명령')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {attachTarget && attachRow ? (
        <BondAttachmentModal
          open
          entryId={attachRow.id}
          step={attachTarget.step}
          companyName={attachRow.업체명}
          attachments={attachmentsOf(attachRow, attachTarget.step)}
          defaultSentDate={attachTarget.step === '회수일정' ? '' : attachRow[attachTarget.step].date}
          readOnly={!canEditRow(attachRow)}
          onRecords={setStored}
          onClose={() => setAttachTarget(null)}
        />
      ) : null}

      {certEntry && certRow ? (
        <CertifiedLetterModal
          entry={certEntry}
          recipient={certRow.recipient}
          onRecords={setStored}
          onClose={() => setCertTargetId(null)}
        />
      ) : null}

      {dismissEntry && dismissRow && noticeDatesReady && dismissalNoticeKind(churnLabelOf(dismissEntry.id)) ? (
        <DismissalNoticeModal
          entry={dismissEntry}
          kind={dismissalNoticeKind(churnLabelOf(dismissEntry.id))!}
          churnLabel={churnLabelOf(dismissEntry.id)}
          recipient={dismissRow.recipient}
          notices={dismissRow.해임통보.notices ?? []}
          contact={bondContactForManager(dismissRow.담당자명) ?? contact}
          contacts={contacts}
          defaults={noticeDefaults}
          nextDocNo={nextDocNo}
          onPayload={applyBondPayload}
          onClose={() => setDismissTargetId(null)}
        />
      ) : null}

      {editEntry && editRow && editNotice ? (
        <DismissalNoticeModal
          key={`${editNotice.entryId}-${editNotice.docNo}`}
          entry={editEntry}
          kind={editNotice.version === '기장' ? '기장' : '유예'}
          churnLabel={churnLabelOf(editEntry.id) || '미지정'}
          recipient={editRow.recipient}
          notices={editRow.해임통보.notices ?? []}
          contact={editNotice.contact ?? bondContactForManager(editRow.담당자명) ?? contact}
          contacts={contacts}
          defaults={noticeDefaults}
          nextDocNo={nextDocNo}
          editing={editNotice}
          onPayload={applyBondPayload}
          onClose={() => setEditNotice(null)}
        />
      ) : null}

      {historyOpen ? (
        <BondHistoryModal
          log={docLog}
          nextDocNo={nextDocNo}
          defaultsLog={defaultsLog}
          companyNames={companyNames}
          canEditEntry={id => {
            const row = allRows.find(r => r.id === id);
            return !!row && canEditRow(row);
          }}
          noticeFileOf={l =>
            (allRows.find(r => r.id === l.entryId)?.해임통보.attachments ?? [])
              .filter(a => a.source === 'generated' && a.sentDate === l.sentDate)
              .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]
          }
          onEditNotice={n => {
            setHistoryOpen(false);
            setEditNotice(n);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </PortalPageShell>
  );
}
