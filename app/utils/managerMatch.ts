import { STAFF_REAL_NAMES } from '@/app/config/dataSources';

/** 내 담당 필터 — 닉네임·실명 모두 매칭 */
export function getManagerMatchNames(userName: string): string[] {
  const names = new Set<string>();
  const trimmed = userName.trim();
  if (!trimmed) return [];

  names.add(trimmed);
  const real = STAFF_REAL_NAMES[trimmed as keyof typeof STAFF_REAL_NAMES];
  if (real) names.add(real);

  for (const [nick, realName] of Object.entries(STAFF_REAL_NAMES)) {
    if (realName === trimmed) names.add(nick);
  }

  return [...names];
}

/** 닉네임·실명 동일 인물 여부 */
export function managerNamesMatch(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return getManagerMatchNames(left).includes(right) || getManagerMatchNames(right).includes(left);
}

/** 협업자 목록의 정식 이름(다야 등)으로 맞춤 — checkoff·알림 키 통일 */
export function resolveCanonicalMemberName(
  actorName: string,
  canonicalNames: readonly string[],
): string {
  for (const name of canonicalNames) {
    if (managerNamesMatch(actorName, name)) return name;
  }
  return actorName.trim();
}
