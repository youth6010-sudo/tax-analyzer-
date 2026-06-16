import type { ClientSearchResult } from '@/app/types/client';

export function compactSearchText(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

export function intakeSearchText(intakeData: Record<string, unknown> | undefined): string {
  if (!intakeData) return '';
  const keys = ['clientContact', 'email', 'callNote', 'taxOfficeContact'];
  return keys
    .map(k => String(intakeData[k] ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

export function mergeClientSearchResults(
  local: ClientSearchResult[],
  api: ClientSearchResult[],
  limit = 20,
): ClientSearchResult[] {
  const byId = new Map<string, ClientSearchResult>();
  for (const item of local) byId.set(item.id, item);
  for (const item of api) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev
      ? {
          ...prev,
          ...item,
          matchedContactName: item.matchedContactName ?? prev.matchedContactName,
          churn: item.churn ?? prev.churn,
        }
      : item);
  }
  const out = [...byId.values()];
  out.sort((a, b) => {
    const aContact = a.matchedContactName ? 0 : 1;
    const bContact = b.matchedContactName ? 0 : 1;
    if (aContact !== bContact) return aContact - bContact;
    return a.companyName.localeCompare(b.companyName, 'ko');
  });
  return out.slice(0, limit);
}
