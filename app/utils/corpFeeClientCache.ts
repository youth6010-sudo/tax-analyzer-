import type { CorpFeeEntry } from '@/lib/review/corpFeeTypes';

const KEY = 'clients.corpFeeByKey.v1';
const PRIMARY_KEY = 'clients.corpFeePrimaryLinks.v1';
const TS_KEY = 'clients.corpFeeByKeyAt.v1';
const TTL_MS = 5 * 60 * 1000;

export type CorpFeeClientCache = {
  byKey: Record<string, CorpFeeEntry>;
  primaryLinksByKey: Record<string, string>;
};

export function readCorpFeeClientCache(): CorpFeeClientCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const ts = Number(sessionStorage.getItem(TS_KEY));
    if (!ts || Date.now() - ts > TTL_MS) return null;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const byKey = JSON.parse(raw) as Record<string, CorpFeeEntry>;
    const primaryRaw = sessionStorage.getItem(PRIMARY_KEY);
    const primaryLinksByKey = primaryRaw
      ? (JSON.parse(primaryRaw) as Record<string, string>)
      : {};
    return { byKey, primaryLinksByKey };
  } catch {
    return null;
  }
}

export function writeCorpFeeClientCache(
  byKey: Record<string, CorpFeeEntry>,
  primaryLinksByKey: Record<string, string> = {},
): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(byKey));
    sessionStorage.setItem(PRIMARY_KEY, JSON.stringify(primaryLinksByKey));
    sessionStorage.setItem(TS_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}
