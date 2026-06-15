/** 블루홀 업체(거래처) — 기본 링크 형식 */
export const BLUEHOLE_CLIENT_URL_BASE = 'https://bluehole.world/client/info';

/** 레거시 케이스 URL (URL에 /case/info/ 가 포함된 경우만 사용) */
export const BLUEHOLE_CASE_URL_BASE = 'https://bluehole.world/case/info';

export type BlueholeLinkKind = 'client' | 'case';

export function parseBlueholeRef(raw: string): { id: string; kind: BlueholeLinkKind } | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^https?:\/\//i.test(t)) {
    const clientMatch = t.match(/\/client\/info\/(\d+)/i);
    if (clientMatch) return { id: clientMatch[1], kind: 'client' };
    const caseMatch = t.match(/\/case\/info\/(\d+)/i);
    if (caseMatch) return { id: caseMatch[1], kind: 'case' };
    return null;
  }

  const id = t.replace(/^#\s*/, '').match(/\d+/)?.[0];
  if (!id) return null;
  return { id, kind: 'client' };
}

/** 숫자·#업체번호·전체 URL → 블루홀 링크 (기본: /client/info/{id}) */
export function buildBlueholeCaseUrl(raw: string): string | null {
  const parsed = parseBlueholeRef(raw);
  if (!parsed) return null;

  if (parsed.kind === 'case') {
    return `${BLUEHOLE_CASE_URL_BASE}/${parsed.id}`;
  }
  return `${BLUEHOLE_CLIENT_URL_BASE}/${parsed.id}?tab_name=info`;
}

/** 신고 체크용 — 항상 케이스 URL (/case/info/{id}) */
export function buildBlueholeFilingCaseUrl(raw: string): string | null {
  const parsed = parseBlueholeRef(raw);
  if (!parsed) {
    const id = raw.trim().replace(/^#\s*/, '').match(/\d+/)?.[0];
    if (!id) return null;
    return `${BLUEHOLE_CASE_URL_BASE}/${id}`;
  }
  return `${BLUEHOLE_CASE_URL_BASE}/${parsed.id}`;
}
