import type { SessionUser } from '@/lib/session';
import { isDataViewer } from '@/lib/masterAccess';
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

/** 미수 원장 가져오기·담당/분류/메모 수정 — 인디·찰리·리아(관리자)·role=admin */
export function canManageArrears(user: UserLike): boolean {
  if (!user) return false;
  return isDataViewer({
    loginId: user.loginId,
    role: user.role === 'admin' || user.role === 'staff' ? user.role : undefined,
    adminMode: user.adminMode,
  });
}

/** 행 조회 — 관리자이거나 본인 담당 행 */
export function canViewArrearsRow(
  user: UserLike,
  rowManagerName: string | null | undefined,
): boolean {
  if (!user) return false;
  if (canManageArrears(user)) return true;
  const myName = user.name?.trim() || '';
  if (!myName) return false;
  return managerNamesMatch(rowManagerName?.trim() || '', myName);
}
