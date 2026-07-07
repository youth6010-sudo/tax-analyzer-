import { buildCorpFeeIndex } from '@/lib/review/corpFeeIndex';
import { companyLinkKey } from '@/lib/review/companyKey';
import { findClientsByCompanyLinkKey } from '@/lib/review/clientLink';
import { listReviewClientLinks } from '@/lib/review/clientLinkDb';

export type ReviewCompanyEntry = {
  reviewKey: string;
  reviewName: string;
  source: string;
};

/** 검토표에 등장하는 업체명 목록 (법인세 조정료 시트 기준) */
export async function listReviewCompanyEntries(): Promise<ReviewCompanyEntry[]> {
  const index = await buildCorpFeeIndex();
  const entries: ReviewCompanyEntry[] = [];
  for (const [key, entry] of Object.entries(index.byKey)) {
    entries.push({
      reviewKey: key,
      reviewName: entry.companyName,
      source: index.sheetName,
    });
  }
  entries.sort((a, b) => a.reviewName.localeCompare(b.reviewName, 'ko'));
  return entries;
}

export async function listUnlinkedReviewCompanies() {
  const [entries, links] = await Promise.all([listReviewCompanyEntries(), listReviewClientLinks()]);
  const linksByKey = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByKey.get(link.reviewKey) ?? [];
    list.push(link);
    linksByKey.set(link.reviewKey, list);
  }

  const unlinked: ReviewCompanyEntry[] = [];
  const linked: {
    entry: ReviewCompanyEntry;
    clientIds: string[];
    manual: boolean;
  }[] = [];

  for (const entry of entries) {
    const manual = linksByKey.get(entry.reviewKey);
    if (manual?.length) {
      linked.push({
        entry,
        clientIds: manual.sort((a, b) => a.sortOrder - b.sortOrder).map(l => l.clientId),
        manual: true,
      });
      continue;
    }
    const clients = await findClientsByCompanyLinkKey(entry.reviewKey);
    if (clients.length) {
      linked.push({
        entry,
        clientIds: clients.map(c => c.id),
        manual: false,
      });
    } else {
      unlinked.push(entry);
    }
  }

  return { unlinked, linked, links };
}

export { companyLinkKey };
