/** 마스터 권한 — 전체 담당자·수임처 조회 (admin 역할 또는 아래 loginId) */
export const MASTER_LOGIN_IDS = ['charlie', 'indie'] as const;

export type MasterLoginId = (typeof MASTER_LOGIN_IDS)[number];

/** @deprecated charlie — 하위 호환용 */
export const PORTAL_ADMIN_LOGIN_ID: MasterLoginId = 'charlie';

export function isMasterUser(
  user: { role?: 'staff' | 'admin'; loginId?: string } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const loginId = user.loginId?.trim();
  return !!loginId && (MASTER_LOGIN_IDS as readonly string[]).includes(loginId);
}

export const isPortalAdmin = isMasterUser;
