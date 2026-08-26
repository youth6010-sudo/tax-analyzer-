/** 휴가·연차 타입 */

export type LeaveKind = 'full' | 'half';
export type LeaveHalfSlot = 'am' | 'pm';
export type LeaveRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'cancel_requested';
/** team_lead = 팀장 선승인 대기, final = 인디 최종 결재 대기 */
export type LeaveApprovalStep = 'team_lead' | 'final';

export type LeaveBalanceDto = {
  id: string | null;
  memberName: string;
  year: number;
  hireDate: string;
  resignDate: string;
  useHireDateBasis: boolean;
  accrued: number;
  carryOver: number;
  increase: number;
  decrease: number;
  /** accrued + carryOver + increase - decrease */
  totalDays: number;
  /** 승인된 휴가 합 */
  usedDays: number;
  /** 신청 중(pending) 휴가 합 */
  pendingDays: number;
  remainingDays: number;
  updatedBy: string;
  updatedAt: string | null;
};

export type LeaveRequestDto = {
  id: string;
  applicantName: string;
  title: string;
  body: string;
  leaveKind: LeaveKind;
  halfSlot: LeaveHalfSlot | '';
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveRequestStatus;
  approvalStep: LeaveApprovalStep;
  teamLeadReviewedBy: string;
  teamLeadReviewedAt: string | null;
  teamLeadReviewNote: string;
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string | null;
  cancelRequestNote: string;
  cancelRequestedAt: string | null;
  /** approved | pending */
  cancelRequestFromStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaveNotificationDto = {
  id: string;
  leaveRequestId: string;
  recipientName: string;
  actorName: string;
  title: string;
  readAt: string | null;
  createdAt: string;
};

export function formatHalfSlotLabel(slot: LeaveHalfSlot | '' | null | undefined): string {
  if (slot === 'am') return '오전 반차';
  if (slot === 'pm') return '오후 반차';
  return '';
}

export function formatLeaveKindLabel(
  kind: LeaveKind,
  halfSlot?: LeaveHalfSlot | '' | null,
): string {
  if (kind === 'half') return formatHalfSlotLabel(halfSlot) || '반차';
  return '연차';
}

export function leaveStatusLabel(
  status: LeaveRequestStatus,
  approvalStep?: LeaveApprovalStep | null,
): string {
  if (status === 'approved') return '승인';
  if (status === 'rejected') return '반려';
  if (status === 'cancelled') return '취소';
  if (status === 'cancel_requested') return '취소 요청';
  if (status === 'pending') {
    if (approvalStep === 'team_lead') return '팀장 승인 중';
    return '결재 대기';
  }
  return status;
}

/** 결재 액션이 필요한 알림 제목 접두어 (신청 제목에 '요청'이 있어도 결과 알림과 구분) */
export const LEAVE_ACTION_REQUEST_TITLE_PREFIXES = [
  '팀장 승인 요청',
  '휴가 결재 요청',
  '최종 결재 요청',
  '휴가 취소 요청',
] as const;

/** 처리 완료(신청자·팀장 확인용) 알림 */
export function isLeaveResultNotifTitle(title: string): boolean {
  const t = title.trim();
  return (
    t.startsWith('휴가 승인') ||
    t.startsWith('휴가 반려') ||
    t.startsWith('휴가 취소 승인') ||
    t.startsWith('휴가 취소 반려')
  );
}

export function isLeaveActionRequestTitle(title: string): boolean {
  const t = title.trim();
  if (isLeaveResultNotifTitle(t)) return false;
  return LEAVE_ACTION_REQUEST_TITLE_PREFIXES.some(p => t.startsWith(p));
}
