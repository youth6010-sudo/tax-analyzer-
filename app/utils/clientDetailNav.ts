/** 수임처 상세 링크 (목록 복귀·스크롤 유지) */
export function buildClientDetailHref(clientId: string, returnTo?: string, scrollY?: number): string {
  if (!returnTo?.trim()) return `/clients/${clientId}`;
  try {
    const u = new URL(returnTo, 'http://local');
    if (scrollY != null && scrollY > 0) u.searchParams.set('scroll', String(Math.round(scrollY)));
    const from = u.pathname + u.search;
    return `/clients/${clientId}?from=${encodeURIComponent(from)}`;
  } catch {
    return `/clients/${clientId}`;
  }
}
