export type ChecklistCategory = 'tax' | 'other';

export type ChecklistTaxType = 'withholding' | 'vat' | 'comprehensive' | 'corporate' | 'other';

export type StoredChecklistTaxType = Exclude<ChecklistTaxType, 'other'> | '';

/** 개인 체크리스트 메모 — 작성자 표시 */
export type PersonalChecklistMemo = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type PersonalChecklistDto = {
  id: string;
  ownerName: string;
  clientId: string | null;
  clientName?: string;
  title: string;
  category: ChecklistCategory;
  taxType: ChecklistTaxType;
  dueDate: string;
  completed: boolean;
  reflectInNotes: boolean;
  /** 공동 담당자 (작성자 외) */
  assigneeNames: string[];
  memos: PersonalChecklistMemo[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CompanyScheduleKind = 'range' | 'deadline';

export type CompanyEventDto = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  scheduleKind: CompanyScheduleKind;
  allDay: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  myCheckoff?: boolean;
  checkoffDone?: number;
  checkoffTotal?: number;
  checkoffs?: Record<string, boolean>;
};

export function formatCompanyEventSchedule(
  ev: Pick<CompanyEventDto, 'scheduleKind' | 'startDate' | 'endDate'>,
): string {
  if (ev.scheduleKind === 'deadline') {
    return `${ev.startDate} 기한`;
  }
  if (ev.startDate === ev.endDate) {
    return ev.startDate;
  }
  return `${ev.startDate} ~ ${ev.endDate}`;
}

export type CalendarEventKind = 'personal' | 'company' | 'tax_deadline' | 'client_task';

export type CalendarEventDto = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  href?: string;
  subtitle?: string;
  ownerName?: string;
  createdAt?: string;
  companyScheduleKind?: CompanyScheduleKind;
  companyDescription?: string;
  /** 개인 완료 또는 회사 일정 본인 체크 완료 */
  completed?: boolean;
};

/** 캘린더·체크리스트 등록일시 표시 */
export function formatCalendarCreatedAt(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 체크리스트 마감일 (YYYY-MM-DD) */
export function formatChecklistDueDate(dueDate: string | undefined): string {
  if (!dueDate?.trim()) return '';
  const [y, m, d] = dueDate.split('-').map(Number);
  if (!y || !m || !d) return dueDate;
  return `${y}. ${m}. ${d}.`;
}

export function isChecklistPastDue(dueDate: string | undefined): boolean {
  if (!dueDate?.trim()) return false;
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export type TaxDeadlineDto = {
  id: string;
  taxType: string;
  title: string;
  date: string;
  periodLabel: string;
};

export const CHECKLIST_TAX_OPTIONS: { id: ChecklistTaxType; label: string }[] = [
  { id: 'withholding', label: '원천세' },
  { id: 'vat', label: '부가세' },
  { id: 'comprehensive', label: '종합소득세' },
  { id: 'corporate', label: '법인세' },
  { id: 'other', label: '기타' },
];

export function checklistTaxTypeFromRow(row: {
  category: string;
  taxType: string | null;
}): ChecklistTaxType {
  if (row.category === 'other') return 'other';
  const stored = row.taxType || '';
  if (stored === 'withholding' || stored === 'vat' || stored === 'comprehensive' || stored === 'corporate') {
    return stored;
  }
  return 'other';
}

export function normalizeChecklistTaxType(taxType: ChecklistTaxType): {
  category: ChecklistCategory;
  taxType: StoredChecklistTaxType;
} {
  if (taxType === 'other') return { category: 'other', taxType: '' };
  return { category: 'tax', taxType };
}

export function getChecklistTypeLabel(taxType: ChecklistTaxType): string {
  return CHECKLIST_TAX_OPTIONS.find(t => t.id === taxType)?.label ?? '기타';
}
