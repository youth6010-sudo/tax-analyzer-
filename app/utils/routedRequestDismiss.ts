/** 비품·시스템개선 — 협업자 「확인」 후 내 목록에서 숨김 (브라우저별) */
export const ROUTED_REQUEST_DISMISSED_KEY = 'clients.routedRequestDismissed.v1';

export function readRoutedRequestDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ROUTED_REQUEST_DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

export function writeRoutedRequestDismissed(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ROUTED_REQUEST_DISMISSED_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new Event(`local-storage:${ROUTED_REQUEST_DISMISSED_KEY}`));
  } catch {
    /* ignore */
  }
}

export function dismissRoutedRequest(itemId: string): void {
  const next = readRoutedRequestDismissed();
  next.add(itemId);
  writeRoutedRequestDismissed(next);
}

export function undismissRoutedRequest(itemId: string): void {
  const next = readRoutedRequestDismissed();
  if (!next.delete(itemId)) return;
  writeRoutedRequestDismissed(next);
}
