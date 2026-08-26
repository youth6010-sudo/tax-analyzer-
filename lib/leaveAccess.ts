import type { SessionUser } from '@/lib/session';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import type { LeaveApprovalStep, LeaveRequestDto } from '@/app/types/leave';

type UserLike =
  | (Partial<Pick<SessionUser, 'loginId' | 'name' | 'role' | 'adminMode'>> & {
      loginId?: string | null;
      name?: string | null;
      role?: string | null;
      adminMode?: boolean | null;
    })
  | null
  | undefined;

function loginIdOf(user: UserLike): string {
  return user?.loginId?.trim().toLowerCase() ?? '';
}

/**
 * 팀원 → 팀장 (닉네임 기준).
 * 팀원 휴가 신청 시 팀장 선승인 후 인디 최종 결재.
 */
export const LEAVE_TEAM_MEMBER_TO_LEAD: ReadonlyArray<{
  member: string;
  lead: string;
  memberLoginId: string;
  leadLoginId: string;
}> = [{ member: '찰리', lead: '리아', memberLoginId: 'charlie', leadLoginId: 'ria' }];

/**
 * 연차 최종 결재(승인·반려)·취소 요청 승인 — 인디만
 * (리아 관리자·찰리는 포함하지 않음)
 * 인디는 연차 잔고·휴가 신청 대상이 아님 (결재만).
 */
export function canApproveLeaveFinal(user: UserLike): boolean {
  if (!user) return false;
  return loginIdOf(user) === 'indie';
}

/** 휴가 신청 가능 — 최종 결재자(인디) 제외 */
export function canApplyLeave(user: UserLike): boolean {
  if (!user) return false;
  return !canApproveLeaveFinal(user);
}

/** @deprecated — canApproveLeaveFinal 사용. 하위 호환 */
export function canApproveLeave(user: UserLike): boolean {
  return canApproveLeaveFinal(user);
}

/** 팀장으로 등록된 사람인지 (예: 리아) */
export function isLeaveTeamLead(user: UserLike): boolean {
  if (!user) return false;
  const login = loginIdOf(user);
  const name = user.name?.trim() || '';
  return LEAVE_TEAM_MEMBER_TO_LEAD.some(
    t => t.leadLoginId === login || managerNamesMatch(name, t.lead),
  );
}

/** 결재 대기 목록 조회 가능 — 팀장 또는 최종 결재자 */
export function canViewLeavePendingQueue(user: UserLike): boolean {
  return canApproveLeaveFinal(user) || isLeaveTeamLead(user);
}

/** 신청자의 팀장 닉네임 (없으면 null → 인디 직결) */
export function resolveLeaveTeamLeadForApplicant(applicantName: string): string | null {
  const name = applicantName.trim();
  if (!name) return null;
  for (const t of LEAVE_TEAM_MEMBER_TO_LEAD) {
    if (managerNamesMatch(name, t.member)) return t.lead;
  }
  return null;
}

export function initialLeaveApprovalStep(applicantName: string): LeaveApprovalStep {
  return resolveLeaveTeamLeadForApplicant(applicantName) ? 'team_lead' : 'final';
}

/** 특정 건에 대해 지금 승인/반려 가능한지 */
export function canReviewLeaveRequest(user: UserLike, item: LeaveRequestDto): boolean {
  if (!user) return false;
  const name = user.name?.trim() || '';
  // 본인 신청은 결재 불가
  if (name && managerNamesMatch(name, item.applicantName)) return false;
  if (item.status === 'cancel_requested') {
    return canApproveLeaveFinal(user);
  }
  if (item.status !== 'pending') return false;
  const step = item.approvalStep || 'final';
  if (step === 'team_lead') {
    const lead = resolveLeaveTeamLeadForApplicant(item.applicantName);
    if (!lead) return false;
    const login = loginIdOf(user);
    const mapping = LEAVE_TEAM_MEMBER_TO_LEAD.find(t => managerNamesMatch(t.lead, lead));
    if (mapping && mapping.leadLoginId === login) return true;
    return managerNamesMatch(name, lead);
  }
  return canApproveLeaveFinal(user);
}

/** 승인된 건만 본인이 취소 요청 가능 (인디 결재) */
export function canRequestLeaveCancel(item: LeaveRequestDto): boolean {
  return item.status === 'approved';
}

/** 승인 전 신청 취소 건만 본인이 삭제 가능 (승인 후 취소 이력은 삭제 불가) */
export function canDeleteCancelledLeave(item: LeaveRequestDto): boolean {
  return item.status === 'cancelled' && item.cancelRequestFromStatus !== 'approved';
}

/**
 * 연차 잔고 전체 조회·수정 — 인디·페리만
 * (찰리·리아 관리자 제외, 최종 결재와 별개)
 */
export function canManageLeaveBalance(user: UserLike): boolean {
  if (!user) return false;
  if (loginIdOf(user) === 'indie') return true;
  const login = loginIdOf(user);
  if (login === 'perry' || login === 'peri') return true;
  return managerNamesMatch(user.name?.trim() || '', '페리');
}

/** 연차 잔고 전체 목록 조회 — 잔고 관리 권한과 동일 */
export function canViewAllLeaveBalances(user: UserLike): boolean {
  return canManageLeaveBalance(user);
}

/** 전체 휴가 신청 현황 조회 — 인디·페리만 (찰리·리아 관리자 제외) */
export function canViewAllLeaveRequests(user: UserLike): boolean {
  return canManageLeaveBalance(user);
}
