import { companyLinkKey } from '@/lib/review/companyKey';

export type CorpFeeEntry = {
  companyName: string;
  staff: string;
  revenueLastYear: number | null;
  adjustmentLastYear: number | null;
  revenueThisYear: number | null;
  adjustmentThisYear: number | null;
};

export type CorpFeeIndex = {
  importedAt: string | null;
  sheetName: string;
  byKey: Record<string, CorpFeeEntry>;
};

/** 클라이언트·엑셀 export에서 사용 (fs 의존 없음) */
export function buildCorpRevenueByClientId(
  clients: readonly { id: string; companyName: string; businessEntityType?: string | null }[],
  byKey: Record<string, CorpFeeEntry>,
  primaryLinksByKey: Record<string, string> = {},
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const usedClientIds = new Set<string>();

  for (const [reviewKey, clientId] of Object.entries(primaryLinksByKey)) {
    out[clientId] = byKey[reviewKey]?.revenueThisYear ?? null;
    usedClientIds.add(clientId);
  }

  for (const client of clients) {
    if (client.businessEntityType !== 'corporate') continue;
    if (usedClientIds.has(client.id)) continue;
    const key = companyLinkKey(client.companyName);
    out[client.id] = key ? (byKey[key]?.revenueThisYear ?? null) : null;
  }
  return out;
}
