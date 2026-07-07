import type { SessionUser } from '@/lib/session';

/** 개발자 — 관리자 모드 로그인 시 전체 메뉴·타인 데이터 수정 */
export const DEVELOPER_LOGIN_IDS = ['charlie', 'ria'] as const;

/** 결재권자 — 전체 데이터 조회·수정 (개발·관리 메뉴 비공개) */
export const DATA_VIEWER_LOGIN_IDS = ['indie'] as const;

export type DeveloperLoginId = (typeof DEVELOPER_LOGIN_IDS)[number];

/** @deprecated charlie — 하위 호환용 */
export const PORTAL_ADMIN_LOGIN_ID: DeveloperLoginId = 'charlie';

/** @deprecated — indie 제외, isDataViewer 사용 */
export const MASTER_LOGIN_IDS = [...DEVELOPER_LOGIN_IDS, ...DATA_VIEWER_LOGIN_IDS] as const;

type AccessUser = Pick<SessionUser, 'role' | 'loginId' | 'adminMode'> | null | undefined;

function normalizeLoginId(user: AccessUser): string {
  return user?.loginId?.trim().toLowerCase() ?? '';
}

/** 개발자 관리자 — 블루홀·데이터 관리 등 adminOnly 메뉴 + 타인 데이터 수정 */
export function isDeveloperAdmin(user: AccessUser): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const loginId = normalizeLoginId(user);
  if (loginId === 'charlie') return true;
  if (loginId === 'ria' && user.adminMode) return true;
  return false;
}

/** 전체 데이터 조회 — 결재권자(인디) + 개발자 관리자 */
export function isDataViewer(user: AccessUser): boolean {
  if (!user) return false;
  if (isDeveloperAdmin(user)) return true;
  const loginId = normalizeLoginId(user);
  return (DATA_VIEWER_LOGIN_IDS as readonly string[]).includes(loginId);
}

/** 로그인 후 관리자 모드 전환 가능 여부 */
export function canToggleAdminMode(user: AccessUser): boolean {
  return normalizeLoginId(user) === 'ria';
}

/** 로그인 화면에서 관리자 모드 선택 가능 여부 */
export function canChooseAdminMode(loginId: string): boolean {
  return loginId.trim().toLowerCase() === 'ria';
}

/** 로그인 시 관리자 모드 자동 적용 (찰리) */
export function isAlwaysAdminModeLogin(loginId: string): boolean {
  return loginId.trim().toLowerCase() === 'charlie';
}

/** 검토표 연결 관리 등 찰리 전용 기능 */
export function isCharlieLogin(user: AccessUser): boolean {
  return normalizeLoginId(user) === 'charlie';
}

/** @deprecated — isDataViewer 와 동일 */
export function isMasterUser(user: AccessUser): boolean {
  return isDataViewer(user);
}

/** @deprecated — isDeveloperAdmin 과 동일 */
export const isPortalAdmin = isDeveloperAdmin;

/** 신고대상확인·안내문 생성기 등 — 전체 조회 권한 없으면 담당 수임처만 */
export type RestrictedClientListScope = 'notice' | 'filing';

export function shouldFilterClientsToMine(
  user: AccessUser,
  scope?: RestrictedClientListScope | null,
): boolean {
  if (isDataViewer(user)) return false;
  return scope === 'notice' || scope === 'filing';
}
