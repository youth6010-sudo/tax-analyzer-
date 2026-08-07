import { canUseCharlieFeatures, isDataViewer } from '@/lib/masterAccess';
import { managerNamesMatch } from '@/app/utils/managerMatch';

function isPerryUser(user: {
  loginId?: string | null;
  name?: string | null;
}): boolean {
  const login = (user.loginId ?? '').trim().toLowerCase();
  if (login === 'perry' || login === 'peri') return true;
  return managerNamesMatch((user.name ?? '').trim(), '페리');
}

/**
 * 회사 일정 등록 —
 * 개발자(찰리·리아 관리자)·결재권자(인디)·페리
 */
export function canCreateCompanyEvent(
  user: {
    name?: string | null;
    loginId?: string | null;
    role?: string | null;
    adminMode?: boolean | null;
  } | null | undefined,
): boolean {
  if (!user) return false;
  if (
    isDataViewer({
      loginId: user.loginId ?? undefined,
      role: user.role === 'admin' || user.role === 'staff' ? user.role : undefined,
      adminMode: user.adminMode ?? undefined,
    })
  ) {
    return true;
  }
  return isPerryUser(user);
}

/** 주간 당번 지정·수정 — 찰리·리아(관리자)·role=admin */
export function canManageDuty(
  user: {
    loginId?: string | null;
    role?: string | null;
    adminMode?: boolean | null;
  } | null | undefined,
): boolean {
  if (!user) return false;
  return canUseCharlieFeatures({
    loginId: user.loginId ?? undefined,
    role: user.role === 'admin' || user.role === 'staff' ? user.role : undefined,
    adminMode: user.adminMode ?? undefined,
  });
}
