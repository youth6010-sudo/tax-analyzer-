export type ChecklistCategory = 'tax' | 'other';

export type ChecklistTaxType =
  | 'withholding'
  | 'vat'
  | 'comprehensive'
  | 'corporate'
  | 'other'
  | 'supplies'
  | 'improvement'
  | 'leave';

export type StoredChecklistTaxType = Exclude<ChecklistTaxType, 'other' | 'leave'> | '';

/** 비품주문요청 — 기본 협업자 */
export const SUPPLIES_ORDER_ASSIGNEE = '다야';

/** 업무개선요청 — 기본 협업자 */
export const IMPROVEMENT_REQUEST_ASSIGNEES = ['리아', '찰리'] as const;

/** 요청 라우팅형(비품·업무개선) — 요청자 TODO 제외, 캘린더 별도 탭 */
export function isRoutedRequestTaxType(
  taxType: ChecklistTaxType | string | null | undefined,
): boolean {
  return taxType === 'supplies' || taxType === 'improvement';
}

export function forcedAssigneesForTaxType(
  taxType: ChecklistTaxType | string | null | undefined,
): readonly string[] {
  if (taxType === 'supplies') return [SUPPLIES_ORDER_ASSIGNEE];
  if (taxType === 'improvement') return IMPROVEMENT_REQUEST_ASSIGNEES;
  return [];
}

/** 개인 체크리스트 메모 — 작성자 표시 */
export type PersonalChecklistAttachment = {
  id: string;
  name: string;
  contentType: string;
  dataUrl: string;
};

export type PersonalChecklistMemo = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  attachments?: PersonalChecklistAttachment[];
};

/** 개인 체크리스트 — 작성자용 완료 알림 */
export type PersonalChecklistNotificationDto = {
  id: string;
  itemId: string;
  actorName: string;
  kind: string;
  title: string;
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
  /** 본인 기준 완료 (협업은 myCheckoff, 단독은 completed 플래그) */
  completed: boolean;
  reflectInNotes: boolean;
  /** 협업자 (작성자 외) */
  assigneeNames: string[];
  memos: PersonalChecklistMemo[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** 반복 일괄 등록 시리즈 ID (있으면 전체 삭제 가능) */
  repeatSeriesId?: string | null;
  /** 협업자 지정된 공동 업무 */
  collaborative?: boolean;
  /** 참여자 (작성자 + 협업자) */
  participants?: string[];
  myCheckoff?: boolean;
  /** 비품·시스템개선 — 본인이 「확인」으로 목록에서 숨김 (계정별) */
  myDismissed?: boolean;
  /** 본인 처리완료 시각 */
  myCompletedAt?: string | null;
  checkoffDone?: number;
  checkoffTotal?: number;
  checkoffs?: Record<string, boolean>;
  /** 참여자별 완료·완료일시 */
  checkoffDetails?: Record<string, CheckoffDetail>;
};

/** 비품주문목록 탭 */
export type SuppliesOrderDto = PersonalChecklistDto & {
  /** 요청일 (= createdAt) */
  requestedAt: string;
  /** 다야 완료처리일 (= 주문일) */
  orderedAt: string | null;
};

/** 업무개선요청 목록 탭 */
export type ImprovementRequestDto = PersonalChecklistDto & {
  requestedAt: string;
  /** 리아·찰리 중 1명 이상 처리 완료일 */
  processedAt: string | null;
  /** 처리 담당자(고정 협업자) */
  handlerNames: string[];
  /** 처리 완료한 담당자 */
  processedBy: string[];
};

/** 홈 TODO 하단 — 전원용 처리완료 피드 */
export type ProcessedRoutedRequestDto = PersonalChecklistDto & {
  requestedAt: string;
  processedAt: string | null;
  processedBy: string[];
};

export type CompanyScheduleKind = 'range' | 'deadline';

/** 담당자별 완료 체크 상세 (완료일 포함) */
export type CheckoffDetail = {
  completed: boolean;
  /** ISO string */
  completedAt: string | null;
  /** 본인 「확인」으로 목록에서 숨긴 시각 */
  dismissedAt?: string | null;
};

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
  /** 담당자 → 완료 여부 (간단) */
  checkoffs?: Record<string, boolean>;
  /** 담당자 → 완료·완료일시 (결재권자·개발자용) */
  checkoffDetails?: Record<string, CheckoffDetail>;
  /** 세무신고 법정 마감 — 자동생성, 수정 불가 */
  source?: 'tax_deadline';
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

export type CalendarEventKind =
  | 'personal'
  | 'company'
  | 'tax_deadline'
  | 'client_task'
  | 'leave'
  | 'duty';

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
  /** 개인 완료 또는 회사·세무신고 일정 본인 체크 완료 */
  completed?: boolean;
  /** 개인 체크리스트 반복 시리즈 ID */
  repeatSeriesId?: string | null;
  /** 휴가 오전/오후 반차 */
  leaveHalfSlot?: 'am' | 'pm' | '';
  checkoffDone?: number;
  checkoffTotal?: number;
  checkoffDetails?: Record<string, CheckoffDetail>;
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

/** 완료 체크 일시 표시 */
export function formatCheckoffCompletedAt(iso: string | null | undefined): string {
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
  { id: 'supplies', label: '비품 주문 요청' },
  { id: 'improvement', label: '시스템 개선 요청' },
  { id: 'leave', label: '휴가신청' },
];

export function isSuppliesOrderTaxType(taxType: ChecklistTaxType | string | null | undefined): boolean {
  return taxType === 'supplies';
}

export function isImprovementRequestTaxType(
  taxType: ChecklistTaxType | string | null | undefined,
): boolean {
  return taxType === 'improvement';
}

export function isLeaveRequestTaxType(
  taxType: ChecklistTaxType | string | null | undefined,
): boolean {
  return taxType === 'leave';
}

export function checklistTaxTypeFromRow(row: {
  category: string;
  taxType: string | null;
}): ChecklistTaxType {
  const stored = row.taxType || '';
  if (stored === 'supplies') return 'supplies';
  if (stored === 'improvement') return 'improvement';
  if (row.category === 'other') return 'other';
  if (stored === 'withholding' || stored === 'vat' || stored === 'comprehensive' || stored === 'corporate') {
    return stored;
  }
  return 'other';
}

export function normalizeChecklistTaxType(taxType: ChecklistTaxType): {
  category: ChecklistCategory;
  taxType: StoredChecklistTaxType;
} {
  if (taxType === 'other' || taxType === 'leave') return { category: 'other', taxType: '' };
  if (taxType === 'supplies') return { category: 'other', taxType: 'supplies' };
  if (taxType === 'improvement') return { category: 'other', taxType: 'improvement' };
  return { category: 'tax', taxType };
}

export function getChecklistTypeLabel(taxType: ChecklistTaxType): string {
  return CHECKLIST_TAX_OPTIONS.find(t => t.id === taxType)?.label ?? '기타';
}
