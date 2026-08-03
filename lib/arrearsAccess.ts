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

/** 미수 원장 가져오기·담당/분류/메모 수정 — 인디·찰리만 */
export function canManageArrears(user: UserLike): boolean {
  if (!user) return false;
  const login = loginIdOf(user);
  if (login === 'charlie') return true;
  if (login === 'indie') return true;
  return (DATA_VIEWER_LOGIN_IDS as readonly string[]).includes(login);
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
