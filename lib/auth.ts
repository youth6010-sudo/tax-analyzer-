import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionData } from './session';
import { getSessionOptions } from './session';

export const PORTAL_ADMIN_LOGIN_ID = 'charlie';

/** 마스터 권한 — 전체 수임처 조회·관리 (찰리 또는 admin 역할) */
export function isMasterUser(user: { role?: 'staff' | 'admin'; loginId?: string }) {
  return user.role === 'admin' || user.loginId === PORTAL_ADMIN_LOGIN_ID;
}

export function isPortalAdmin(user: { role?: 'staff' | 'admin'; loginId?: string }) {
  return isMasterUser(user);
}

export async function getServerSession() {
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  return session;
}

export async function requireUser() {
  const session = await getServerSession();
  if (!session.user) {
    throw new Error('UNAUTHORIZED');
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isPortalAdmin(user)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}
