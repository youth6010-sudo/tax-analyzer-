import type { ClientSearchResult } from '@/app/types/client';
import { compactSearchText } from '@/app/utils/searchNormalize';

function textMatches(hay: string, qLower: string, qCompact: string): boolean {
  const lower = hay.toLowerCase();
  if (lower.includes(qLower)) return true;
  if (qCompact.length >= 2 && compactSearchText(hay).includes(qCompact)) return true;
  return false;
}

function pickMatchedContactName(item: ClientSearchResult, qLower: string, qCompact: string): string | undefined {
  for (const name of item.contactNames ?? []) {
    if (textMatches(name, qLower, qCompact)) return name;
  }
  const primary = item.primaryContactName?.trim();
  if (primary && textMatches(primary, qLower, qCompact)) return primary;
  const clientContact = item.intakeSearchText?.trim();
  if (clientContact && textMatches(clientContact, qLower, qCompact)) return clientContact;
  return undefined;
}

export function filterClientSearchIndex(
  index: ClientSearchResult[],
  query: string,
  limit = 20,
): ClientSearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const qCompact = compactSearchText(q);
  const digits = q.replace(/\D/g, '');

  const scored: { item: ClientSearchResult; rank: number }[] = [];

  for (const item of index) {
    const fields = [
      item.companyName,
      item.representative,
      item.manager,
      item.phone,
      item.businessNo,
      item.primaryContactName ?? '',
      item.contactSearchText ?? '',
      item.intakeSearchText ?? '',
    ];
    const hay = fields.join(' ');
    let rank = -1;

    if (item.companyName.toLowerCase().startsWith(qLower)) rank = 0;
    else if (textMatches(hay, qLower, qCompact)) rank = 1;
    else if (digits.length >= 2) {
      const ph = item.phone.replace(/\D/g, '');
      const biz = item.businessNo.replace(/\D/g, '');
      const contactHay = (item.contactSearchText ?? '').replace(/\D/g, '');
      if (ph.includes(digits) || biz.includes(digits) || contactHay.includes(digits)) rank = 2;
    }

    if (rank >= 0) {
      const matchedContactName = pickMatchedContactName(item, qLower, qCompact);
      scored.push({
        item: matchedContactName ? { ...item, matchedContactName } : item,
        rank,
      });
    }
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aContact = a.item.matchedContactName ? 0 : 1;
    const bContact = b.item.matchedContactName ? 0 : 1;
    if (aContact !== bContact) return aContact - bContact;
    return a.item.companyName.localeCompare(b.item.companyName, 'ko');
  });

  return scored.slice(0, limit).map(s => s.item);
}
