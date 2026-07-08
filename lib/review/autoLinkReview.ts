import { listClients } from '@/lib/clientsDb';
import {
  listLinkedReviewKeys,
  listReviewClientLinks,
  replaceReviewClientLinks,
} from '@/lib/review/clientLinkDb';
import { matchAllReviewEntries, type MatchResult } from '@/lib/review/clientMatch';
import { invalidateClientLinksIndexCache } from '@/lib/review/clientLink';
import { listReviewCompanyEntries } from '@/lib/review/reviewCompanyIndex';

export type AutoLinkSummary = {
  linked: { reviewKey: string; reviewName: string; clientIds: string[]; method: string }[];
  skipped: number;
  suggestions: { reviewKey: string; reviewName: string; items: MatchResult['suggestions'] }[];
  legacyKeyWarnings: string[];
};

/** 고신뢰 자동 연결 — 기존 DB 연결은 건드리지 않음 */
export async function runAutoLinkReviewClients(updatedBy: string | null): Promise<AutoLinkSummary> {
  const [entries, clients, existingLinks] = await Promise.all([
    listReviewCompanyEntries(),
    listClients({ includeChurned: true }),
    listReviewClientLinks(),
  ]);

  const linkedKeys = await listLinkedReviewKeys();
  const results = matchAllReviewEntries(entries, clients, { skipReviewKeys: linkedKeys });

  const linked: AutoLinkSummary['linked'] = [];
  const suggestions: AutoLinkSummary['suggestions'] = [];
  const legacyKeyWarnings: string[] = [];
  let skipped = 0;

  for (const result of results) {
    if (result.confidence === 'high' && result.clientIds.length && result.method) {
      if (!result.reviewKey.includes('/')) {
        legacyKeyWarnings.push(result.reviewKey);
      }
      await replaceReviewClientLinks({
        reviewKey: result.reviewKey,
        reviewName: result.reviewName,
        clientIds: result.clientIds,
        updatedBy,
        matchMethod: result.method,
      });
      linked.push({
        reviewKey: result.reviewKey,
        reviewName: result.reviewName,
        clientIds: result.clientIds,
        method: result.method,
      });
    } else if (result.suggestions.length) {
      suggestions.push({
        reviewKey: result.reviewKey,
        reviewName: result.reviewName,
        items: result.suggestions,
      });
      skipped++;
    } else {
      skipped++;
    }
  }

  if (linked.length) {
    invalidateClientLinksIndexCache();
  }

  void existingLinks;
  return { linked, skipped, suggestions, legacyKeyWarnings };
}
