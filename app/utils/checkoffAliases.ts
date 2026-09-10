import type { CheckoffDetail } from '@/app/types/calendar';
import { getManagerMatchNames } from '@/app/utils/managerMatch';

/** 완료된 쪽을 우선 — 닉네임·실명 행이 섞여 있어도 완료가 보이게 */
export function preferCheckoffDetail(
  a: CheckoffDetail | undefined,
  b: CheckoffDetail | undefined,
): CheckoffDetail | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.completed !== b.completed) return a.completed ? a : b;
  const aAt = a.completedAt ?? '';
  const bAt = b.completedAt ?? '';
  if (aAt && bAt) return aAt >= bAt ? a : b;
  return a.completedAt ? a : b;
}

/** DB에 저장된 한 이름 → 닉네임·실명 키 모두에 동일 상세 반영 */
export function putCheckoffDetailWithAliases(
  target: Record<string, CheckoffDetail>,
  memberName: string,
  detail: CheckoffDetail,
): void {
  const names = new Set([memberName.trim(), ...getManagerMatchNames(memberName)]);
  for (const name of names) {
    if (!name) continue;
    const merged = preferCheckoffDetail(target[name], detail);
    if (merged) target[name] = merged;
  }
}

/** 본인 완료 여부 — 닉네임·실명 모두 인정 */
export function isMyCheckoffDone(
  checkoffs: Record<string, boolean> | null | undefined,
  userName: string,
): boolean {
  if (!checkoffs) return false;
  return getManagerMatchNames(userName).some(a => !!checkoffs[a]);
}

/** 팀원 기준 완료 수 — 별칭 중복 카운트 방지 */
export function countTeamCheckoffsDone(
  checkoffs: Record<string, boolean> | null | undefined,
  team: readonly string[],
): number {
  if (!checkoffs) return 0;
  return team.filter(name => isMyCheckoffDone(checkoffs, name)).length;
}
