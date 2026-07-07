/** 담당자별 네이버웍스(세무팀) 메일 */
export type ManagerContact = {
  email: string;
};

const YOUTH_EMAIL = (n: number) => `youth${n}@taxbiz.kr`;

/** 표시 이름(수임처 담당자명) 기준 */
export const MANAGER_CONTACT_BY_NAME: Record<string, ManagerContact> = {
  블루: { email: YOUTH_EMAIL(2) },
  리아: { email: YOUTH_EMAIL(3) },
  윈터: { email: YOUTH_EMAIL(4) },
  다야: { email: YOUTH_EMAIL(5) },
  페리: { email: YOUTH_EMAIL(6) },
  찰리: { email: YOUTH_EMAIL(7) },
};

/** 로그인 ID 기준 */
export const MANAGER_CONTACT_BY_LOGIN: Record<string, ManagerContact> = {
  blue: MANAGER_CONTACT_BY_NAME['블루'],
  ria: MANAGER_CONTACT_BY_NAME['리아'],
  winter: MANAGER_CONTACT_BY_NAME['윈터'],
  daya: MANAGER_CONTACT_BY_NAME['다야'],
  peri: MANAGER_CONTACT_BY_NAME['페리'],
  charlie: MANAGER_CONTACT_BY_NAME['찰리'],
};

export const ALL_MANAGER_CONTACTS: ManagerContact[] = Object.values(MANAGER_CONTACT_BY_NAME);

export function resolveManagerContact(user?: {
  name?: string | null;
  loginId?: string | null;
} | null): ManagerContact | null {
  if (!user) return null;
  const byName = user.name?.trim();
  if (byName && MANAGER_CONTACT_BY_NAME[byName]) return MANAGER_CONTACT_BY_NAME[byName];
  const login = user.loginId?.trim().toLowerCase();
  if (login && MANAGER_CONTACT_BY_LOGIN[login]) return MANAGER_CONTACT_BY_LOGIN[login];
  return null;
}
