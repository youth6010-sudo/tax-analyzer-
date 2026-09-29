import { managerNamesMatch } from '@/app/utils/managerMatch';

/** 퇴사자 — 업무대체자·협업자·담당 선택 후보에서 제외 (과거 기록·담당 이력은 유지) */
export const RETIRED_STAFF = ['다야'] as const;

export function isRetiredStaff(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  return RETIRED_STAFF.some(r => managerNamesMatch(n, r));
}
