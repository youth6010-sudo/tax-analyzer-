import { managerNamesMatch } from '@/app/utils/managerMatch';

/**
 * 기본 업무대체 페어 (서로 대체).
 * 블루↔다야, 페리↔윈터, 리아↔찰리
 */
export const LEAVE_SUBSTITUTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['블루', '다야'],
  ['페리', '윈터'],
  ['리아', '찰리'],
] as const;

/** 신청자의 기본 업무대체자 닉네임 (없으면 null) */
export function defaultLeaveSubstituteNick(applicantName: string): string | null {
  const name = applicantName.trim();
  if (!name) return null;
  for (const [a, b] of LEAVE_SUBSTITUTE_PAIRS) {
    if (managerNamesMatch(name, a)) return b;
    if (managerNamesMatch(name, b)) return a;
  }
  return null;
}

/** 두 이름이 같은 기본 페어인지 */
export function isDefaultLeaveSubstitutePair(a: string, b: string): boolean {
  const defaultForA = defaultLeaveSubstituteNick(a);
  return !!defaultForA && managerNamesMatch(defaultForA, b);
}

export function datesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && endA >= startB;
}
