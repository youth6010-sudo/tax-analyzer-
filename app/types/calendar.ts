export type ChecklistCategory = 'tax' | 'other';

export type ChecklistTaxType = 'withholding' | 'vat' | 'comprehensive' | 'corporate';

export type PersonalChecklistDto = {
  id: string;
  ownerName: string;
  clientId: string | null;
  clientName?: string;
  title: string;
  category: ChecklistCategory;
  taxType: ChecklistTaxType | '';
  dueDate: string;
  completed: boolean;
  reflectInNotes: boolean;
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
];
