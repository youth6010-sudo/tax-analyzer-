export const BLUEHOLE_CASE_URL_BASE = 'https://bluehole.world/case/info';

export function buildBlueholeCaseUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const id = t.replace(/^#\s*/, '').match(/\d+/)?.[0];
  return id ? `${BLUEHOLE_CASE_URL_BASE}/${id}` : null;
}
