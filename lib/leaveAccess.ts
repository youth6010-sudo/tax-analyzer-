import type { SessionUser } from '@/lib/session';
import { DATA_VIEWER_LOGIN_IDS } from '@/lib/masterAccess';
import { managerNamesMatch } from '@/app/utils/managerMatch';

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

/** 연차 결재(승인·반려) — 인디만 */
export function canApproveLeave(user: UserLike): boolean {
  if (!user) return false;
  const login = loginIdOf(user);
  return login === 'indie' || (DATA_VIEWER_LOGIN_IDS as readonly string[]).includes(login);
}

/**
 * 연차 잔고 전체 조회·수정 — 인디·페리만
 * (다른 담당자는 본인 잔고만 조회, 수정 불가)
 */
export function canManageLeaveBalance(user: UserLike): boolean {
  if (!user) return false;
  if (canApproveLeave(user)) return true;
  const login = loginIdOf(user);
  if (login === 'perry' || login === 'peri') return true;
  return managerNamesMatch(user.name?.trim() || '', '페리');
}

/** 연차 잔고 전체 목록 조회 — 인디·페리만 (그 외는 본인만) */
export function canViewAllLeaveBalances(user: UserLike): boolean {
  return canManageLeaveBalance(user);
}
