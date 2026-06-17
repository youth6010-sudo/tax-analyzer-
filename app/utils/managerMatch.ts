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
