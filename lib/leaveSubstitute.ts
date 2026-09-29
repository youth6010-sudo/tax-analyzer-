import { managerNamesMatch } from '@/app/utils/managerMatch';

/**
 * 기본 업무대체자 (신청자 → 대체자).
 * 블루→리아, 리아→블루, 찰리→리아, 페리↔윈터
 */
export const LEAVE_DEFAULT_SUBSTITUTES: ReadonlyArray<readonly [string, string]> = [
  ['블루', '리아'],
  ['리아', '블루'],
  ['찰리', '리아'],
  ['페리', '윈터'],
  ['윈터', '페리'],
] as const;

/** 안내 문구용 */
export const LEAVE_DEFAULT_SUBSTITUTE_LABEL = '블루↔리아 · 찰리→리아 · 페리↔윈터';

/** 신청자의 기본 업무대체자 닉네임 (없으면 null) */
export function defaultLeaveSubstituteNick(applicantName: string): string | null {
  const name = applicantName.trim();
  if (!name) return null;
  for (const [applicant, substitute] of LEAVE_DEFAULT_SUBSTITUTES) {
    if (managerNamesMatch(name, applicant)) return substitute;
  }
  return null;
}

/** b가 a의 기본 대체자인지 */
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
