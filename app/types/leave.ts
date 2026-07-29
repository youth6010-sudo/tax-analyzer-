/** 휴가·연차 타입 */

export type LeaveKind = 'full' | 'half';
export type LeaveHalfSlot = 'am' | 'pm';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

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
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string | null;
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

export function leaveStatusLabel(status: LeaveRequestStatus): string {
  if (status === 'pending') return '대기';
  if (status === 'approved') return '승인';
  if (status === 'rejected') return '반려';
  if (status === 'cancelled') return '취소';
  return status;
}
