import { isDataViewer } from '@/lib/masterAccess';

/**
 * 회사 일정 등록 —
 * 개발자(찰리·리아 관리자모드)·관리자(role=admin)·결재권자(인디)만 가능
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
  return isDataViewer({
    loginId: user.loginId ?? undefined,
    role: user.role === 'admin' || user.role === 'staff' ? user.role : undefined,
    adminMode: user.adminMode ?? undefined,
  });
}

/** 주간 당번 지정·수정 — 찰리만 */
export function canManageDuty(
  user: {
    loginId?: string | null;
  } | null | undefined,
): boolean {
  if (!user) return false;
  return (user.loginId ?? '').trim().toLowerCase() === 'charlie';
}
