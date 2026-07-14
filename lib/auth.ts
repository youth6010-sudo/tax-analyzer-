import { redirect } from 'next/navigation';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionData } from './session';
import { getSessionOptions } from './session';

export {
  isMasterUser,
  isDataViewer,
  isDeveloperAdmin,
  isPortalAdmin,
  MASTER_LOGIN_IDS,
  DEVELOPER_LOGIN_IDS,
  DATA_VIEWER_LOGIN_IDS,
  canToggleAdminMode,
  canUseCharlieFeatures,
  canUseIndieFeatures,
  isRiaAdminMode,
} from './masterAccess';

import { canUseCharlieFeatures, isPortalAdmin } from './masterAccess';

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

/** 서버 페이지용 — 미인증 시 500 대신 로그인으로 이동 */
export async function requireUserPage() {
  const session = await getServerSession();
  if (!session.user) {
    redirect('/login');
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

/** 찰리·개발자 전용 API */
export async function requireCharlie() {
  const user = await requireUser();
  if (!canUseCharlieFeatures(user)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

/** 검토표 수임처 연결 Admin — 개발자만 (인디 메뉴 비공개) */
export async function requireReviewLinkAdmin() {
  const user = await requireUser();
  if (!isPortalAdmin(user)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}
