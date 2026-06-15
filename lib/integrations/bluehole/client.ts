import { buildBlueholeCaseUrl } from '@/app/config/bluehole';
import type { BlueholeApiCaseResponse, BlueholeCaseSummary } from './types';

function apiConfigured(): boolean {
  return Boolean(process.env.BLUEHOLE_API_URL?.trim() && process.env.BLUEHOLE_API_KEY?.trim());
}

function normalizeCase(raw: BlueholeApiCaseResponse, caseId: string): BlueholeCaseSummary {
  const url = buildBlueholeCaseUrl(caseId) ?? `https://bluehole.world/client/info/${caseId}?tab_name=info`;
  return {
    id: caseId,
    title: raw.title,
    status: raw.status,
    manager: raw.manager ?? raw.managerName,
    updatedAt: raw.updatedAt ?? raw.updated_at,
    url,
    source: 'api',
  };
}

/** API 미설정 시 딥링크만 반환 (Phase 1 fallback) */
export function manualCaseSummary(caseId: string): BlueholeCaseSummary {
  const url = buildBlueholeCaseUrl(caseId) ?? `https://bluehole.world/client/info/${caseId}?tab_name=info`;
  return { id: caseId, url, source: 'manual' };
}

export async function fetchBlueholeCase(caseId: string): Promise<BlueholeCaseSummary> {
  const trimmed = caseId.trim().replace(/^#\s*/, '');
  const id = trimmed.match(/\d+/)?.[0] ?? trimmed;
  if (!id) throw new Error('INVALID_CASE_ID');

  if (!apiConfigured()) {
    return manualCaseSummary(id);
  }

  const base = process.env.BLUEHOLE_API_URL!.replace(/\/$/, '');
  const res = await fetch(`${base}/cases/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${process.env.BLUEHOLE_API_KEY}`,
      Accept: 'application/json',
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error('NOT_FOUND');
    return manualCaseSummary(id);
  }

  const data = (await res.json()) as BlueholeApiCaseResponse;
  return normalizeCase(data, id);
}

export function isBlueholeApiEnabled(): boolean {
  return apiConfigured();
}
