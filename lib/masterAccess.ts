import type { SessionUser } from '@/lib/session';

/**
 * 권한 모델
 * - 개발자(찰리, 리아 관리자모드, DB role=admin): 찰리 기능 + 인디의 입력·수정·조회 기능
 *   (휴가 최종 결재·취소 승인만 인디 전용으로 제외)
 * - 결재권자(인디): 전 수임처 자료 조회·수정, 휴가 최종 결재, 일반 담당과 동일한 메뉴만 (관리·블루홀 등 비공개)
 * - 일반 담당: 본인 담당 범위
 */

/** 개발자 — 관리자 모드 로그인 시 전체 메뉴·권한 */
export const DEVELOPER_LOGIN_IDS = ['charlie', 'ria'] as const;

/** 결재권자 — 전체 데이터 조회·수정 (개발·관리 메뉴 비공개) */
export const DATA_VIEWER_LOGIN_IDS = ['indie'] as const;

export type DeveloperLoginId = (typeof DEVELOPER_LOGIN_IDS)[number];

/** @deprecated charlie — 하위 호환용 */
export const PORTAL_ADMIN_LOGIN_ID: DeveloperLoginId = 'charlie';

/** @deprecated — indie 제외, isDataViewer 사용 */
export const MASTER_LOGIN_IDS = [...DEVELOPER_LOGIN_IDS, ...DATA_VIEWER_LOGIN_IDS] as const;

type AccessUser =
  | (Partial<Pick<SessionUser, 'loginId' | 'role' | 'adminMode'>> & {
      loginId?: string | null;
      role?: SessionUser['role'] | null;
      adminMode?: boolean | null;
    })
  | null
  | undefined;

function normalizeLoginId(user: AccessUser): string {
  return user?.loginId?.trim().toLowerCase() ?? '';
}

/** 개발자 — 블루홀·관리 메뉴 포함 전 권한 */
export function isDeveloperAdmin(user: AccessUser): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const loginId = normalizeLoginId(user);
  if (loginId === 'charlie') return true;
  if (loginId === 'ria' && user.adminMode) return true;
  return false;
}

/** 전체 데이터 조회·수정 — 결재권자(인디) + 개발자 */
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

/** 리아 관리자 모드 */
export function isRiaAdminMode(user: AccessUser): boolean {
  return normalizeLoginId(user) === 'ria' && !!user?.adminMode;
}

/**
 * 개발자 전용으로 두던 메뉴·기능 (검토표 연결 등)
 * — 찰리 · 리아 관리자 · role=admin
 */
export function canUseCharlieFeatures(user: AccessUser): boolean {
  return isDeveloperAdmin(user);
}

/**
 * 검토표 제목행·열 구성 등 — 인디가 입력·수정하는 기능
 * — 개발자(찰리·리아 관리자) + 결재권자(인디)
 * — 휴가 최종 결재는 leaveAccess.canApproveLeaveFinal (인디만)
 */
export function canUseIndieFeatures(user: AccessUser): boolean {
  return isDeveloperAdmin(user) || normalizeLoginId(user) === 'indie';
}

/** @deprecated — canUseCharlieFeatures 사용 */
export function isCharlieLogin(user: AccessUser): boolean {
  return canUseCharlieFeatures(user);
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
