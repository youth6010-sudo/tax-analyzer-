export const COMPANY_EVENT_CREATORS = [
  { name: '인디', loginId: 'indie' },
  { name: '리아', loginId: 'ria' },
] as const;

export function canCreateCompanyEvent(
  user: { name?: string; loginId?: string } | null | undefined,
): boolean {
  if (!user) return false;
  return COMPANY_EVENT_CREATORS.some(
    c => user.name === c.name || user.loginId === c.loginId,
  );
}
