import { getClientsByIds, listClients } from '@/lib/clientsDb';
import {
  buildAltLinkKeys,
  companyLinkKey,
  legacyBaseKeyFromScopedReviewKey,
  normalizeReviewLookupKey,
  scopedReviewKey,
} from '@/lib/review/companyKey';
import {
  buildClientMatchIndex,
  filingTaxForEntry,
  matchReviewEntry,
  type MatchMethod,
} from '@/lib/review/clientMatch';
import {
  buildPrimaryClientLinksByKey,
  listLinksByReviewKey,
  listReviewClientLinks,
} from '@/lib/review/clientLinkDb';
import type { ReviewCompanyEntry, ReviewTaxKind } from '@/lib/review/reviewCompanyIndex';

export type LinkedClient = {
  id: string;
  companyName: string;
  manager: string;
  status: string;
  href: string;
};

export type ClientLinkEntry = {
  linked: boolean;
  clients: LinkedClient[];
  primary: LinkedClient | null;
  manual: boolean;
};

const INDEX_TTL_MS = 90_000;

let indexCache: { at: number; index: Record<string, ClientLinkEntry> } | null = null;
let poolCache: { at: number; pool: Awaited<ReturnType<typeof listClients>> } | null = null;
let bundleCache: {
  at: number;
  index: Record<string, ClientLinkEntry>;
  byClientId: Record<string, ClientReviewKeyEntry[]>;
} | null = null;

type LinkBundleData = {
  manualLinks: Awaited<ReturnType<typeof listReviewClientLinks>>;
  pool: Awaited<ReturnType<typeof listClients>>;
  clientById: Map<string, Awaited<ReturnType<typeof listClients>>[number]>;
  loadedAt: number;
};

type ReviewLinkSharedData = LinkBundleData & {
  entries: ReviewCompanyEntry[];
  matchIndex: ReturnType<typeof buildClientMatchIndex>;
  entryByKey: Map<string, ReviewCompanyEntry>;
};

let fastBundleData: LinkBundleData | null = null;
let fastBundleInflight: Promise<LinkBundleData> | null = null;

let sharedData: ReviewLinkSharedData | null = null;
let sharedInflight: Promise<ReviewLinkSharedData> | null = null;

const linkContextCache = new Map<string, { at: number; value: ClientReviewLinkContext | null }>();

export function invalidateClientLinksIndexCache() {
  indexCache = null;
  poolCache = null;
  bundleCache = null;
  fastBundleData = null;
  fastBundleInflight = null;
  sharedData = null;
  sharedInflight = null;
  linkContextCache.clear();
}

function toLinkedClient(client: {
  id: string;
  companyName: string;
  manager: string;
  status: string;
}): LinkedClient {
  return {
    id: client.id,
    companyName: client.companyName,
    manager: client.manager,
    status: client.status,
    href: `/clients/${client.id}`,
  };
}

async function getCachedClientPool() {
  const now = Date.now();
  if (poolCache && now - poolCache.at < INDEX_TTL_MS) return poolCache.pool;
  const pool = await listClients({ includeChurned: true });
  poolCache = { at: now, pool };
  return pool;
}

function baseKeyFromIndexKey(key: string): string {
  return key.includes('/') ? legacyBaseKeyFromScopedReviewKey(key) : key;
}

function countIndexKeysForBase(
  index: Record<string, ClientLinkEntry>,
  baseKey: string,
): number {
  let count = 0;
  for (const k of Object.keys(index)) {
    if (baseKeyFromIndexKey(k) === baseKey) count++;
  }
  return count;
}

function isAmbiguousLegacyBase(
  index: Record<string, ClientLinkEntry>,
  baseKey: string,
): boolean {
  return countIndexKeysForBase(index, baseKey) > 1;
}

function lookupIndexEntry(
  index: Record<string, ClientLinkEntry>,
  normalized: string,
  options?: { owner?: string; allowLegacy?: boolean },
): ClientLinkEntry | null {
  if (index[normalized]) return index[normalized];

  const isLegacy = !normalized.includes('/');
  if (isLegacy) {
    if (options?.owner) {
      const scoped = scopedReviewKey(options.owner, normalized);
      if (index[scoped]) return index[scoped];
    }
    if (isAmbiguousLegacyBase(index, normalized)) {
      return options?.allowLegacy === true ? index[normalized] ?? null : null;
    }
    if (options?.owner) return null;
  }

  if (isLegacy && !isAmbiguousLegacyBase(index, normalized)) {
    for (const alt of buildAltLinkKeys(normalized)) {
      if (index[alt]) return index[alt];
    }
  }

  return null;
}

function findReviewEntry(
  shared: ReviewLinkSharedData,
  lookup: { key?: string; owner?: string; personName?: string },
): ReviewCompanyEntry | undefined {
  const rawKey = lookup.key?.trim() ?? '';
  if (lookup.owner && rawKey && !rawKey.includes('/')) {
    const baseKey = companyLinkKey(rawKey);
    const scoped = scopedReviewKey(lookup.owner, baseKey, lookup.personName);
    const scopedHit = shared.entryByKey.get(scoped);
    if (scopedHit) return scopedHit;
  }

  const normalized = normalizeReviewLookupKey(rawKey);
  if (!normalized) return undefined;
  if (shared.entryByKey.has(normalized)) return shared.entryByKey.get(normalized);

  if (!normalized.includes('/') && lookup.owner) {
    const scoped = scopedReviewKey(lookup.owner, companyLinkKey(normalized), lookup.personName);
    const scopedHit = shared.entryByKey.get(scoped);
    if (scopedHit) return scopedHit;
  }

  const byAlt = shared.entries.find(
    e => e.reviewKey === normalized || e.altKeys?.includes(normalized),
  );
  if (byAlt) return byAlt;

  if (!normalized.includes('/') && lookup.owner) {
    const ownerScoped = shared.entries.filter(
      e => e.reviewKey.startsWith(`${lookup.owner}/${normalized}`),
    );
    if (ownerScoped.length === 1) return ownerScoped[0];
  }

  return undefined;
}

async function loadFastLinkBundleData(): Promise<LinkBundleData> {
  const now = Date.now();
  if (fastBundleData && now - fastBundleData.loadedAt < INDEX_TTL_MS) return fastBundleData;
  if (fastBundleInflight) return fastBundleInflight;

  fastBundleInflight = (async () => {
    const [manualLinks, pool] = await Promise.all([
      listReviewClientLinks(),
      getCachedClientPool(),
    ]);
    const data: LinkBundleData = {
      manualLinks,
      pool,
      clientById: new Map(pool.map(c => [c.id, c])),
      loadedAt: Date.now(),
    };
    fastBundleData = data;
    fastBundleInflight = null;
    return data;
  })();

  return fastBundleInflight;
}

async function loadReviewLinkSharedData(): Promise<ReviewLinkSharedData> {
  const now = Date.now();
  if (sharedData && now - sharedData.loadedAt < INDEX_TTL_MS) return sharedData;
  if (sharedInflight) return sharedInflight;

  sharedInflight = (async () => {
    const { listReviewCompanyEntries } = await import('@/lib/review/reviewCompanyIndex');
    const [entries, manualLinks, pool] = await Promise.all([
      listReviewCompanyEntries(),
      listReviewClientLinks(),
      getCachedClientPool(),
    ]);
    const data: ReviewLinkSharedData = {
      entries,
      manualLinks,
      pool,
      matchIndex: buildClientMatchIndex(pool),
      entryByKey: new Map(entries.map(e => [e.reviewKey, e])),
      clientById: new Map(pool.map(c => [c.id, c])),
      loadedAt: Date.now(),
    };
    sharedData = data;
    sharedInflight = null;
    return data;
  })();

  return sharedInflight;
}

function buildIndexFromLinks(data: LinkBundleData): Record<string, ClientLinkEntry> {
  const index: Record<string, ClientLinkEntry> = {};
  const linksByKey = new Map<string, { clientIds: string[]; manual: boolean }>();

  for (const link of data.manualLinks) {
    const bucket = linksByKey.get(link.reviewKey) ?? { clientIds: [], manual: false };
    bucket.clientIds.push(link.clientId);
    if (link.matchMethod === 'manual') bucket.manual = true;
    linksByKey.set(link.reviewKey, bucket);
  }

  for (const [key, { clientIds, manual }] of linksByKey) {
    const clients = clientIds
      .map(id => data.clientById.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map(toLinkedClient);
    index[key] = {
      linked: clients.length > 0,
      clients,
      primary: clients[0] ?? null,
      manual,
    };
  }

  return index;
}

function toClientReviewKeyEntry(
  reviewKey: string,
  entry: ReviewCompanyEntry | undefined,
): ClientReviewKeyEntry {
  const incomeSource = entry?.sources.find(s => s.taxKind === 'income');
  return {
    reviewKey,
    reviewName: entry?.reviewName ?? reviewKey,
    owners: entry?.owners ?? [],
    taxKinds: entry?.taxKinds ?? [],
    focusOwner: incomeSource?.owner ?? entry?.owners[0],
    focusRow: incomeSource?.row,
  };
}

function ownersFromReviewKey(reviewKey: string): string[] {
  const owner = reviewKey.split('/')[0]?.trim();
  return owner ? [owner] : [];
}

function toClientReviewKeyEntryFromLink(
  reviewKey: string,
  reviewName: string,
  entry?: ReviewCompanyEntry,
): ClientReviewKeyEntry {
  if (entry) return toClientReviewKeyEntry(reviewKey, entry);
  const incomeSource = undefined;
  return {
    reviewKey,
    reviewName,
    owners: ownersFromReviewKey(reviewKey),
    taxKinds: [],
    focusOwner: ownersFromReviewKey(reviewKey)[0],
    focusRow: incomeSource,
  };
}

function buildByClientIdFromLinks(
  data: LinkBundleData,
  entryByKey?: Map<string, ReviewCompanyEntry>,
): Record<string, ClientReviewKeyEntry[]> {
  const byClientId: Record<string, ClientReviewKeyEntry[]> = {};

  const push = (clientId: string, reviewKey: string, reviewName: string) => {
    const item = toClientReviewKeyEntryFromLink(
      reviewKey,
      reviewName,
      entryByKey?.get(reviewKey),
    );
    const list = byClientId[clientId] ?? [];
    if (!list.some(x => x.reviewKey === reviewKey)) {
      list.push(item);
      byClientId[clientId] = list;
    }
  };

  for (const link of data.manualLinks) {
    push(link.clientId, link.reviewKey, link.reviewName || link.reviewKey);
  }

  return byClientId;
}

function buildByClientIdFromShared(
  shared: ReviewLinkSharedData,
): Record<string, ClientReviewKeyEntry[]> {
  return buildByClientIdFromLinks(shared, shared.entryByKey);
}

/** 검토표 초기 로드용 — DB 연결만 (경량) */
export async function buildClientLinksBundleFast(): Promise<{
  index: Record<string, ClientLinkEntry>;
  byClientId: Record<string, ClientReviewKeyEntry[]>;
}> {
  const now = Date.now();
  if (bundleCache && now - bundleCache.at < INDEX_TTL_MS) {
    return { index: bundleCache.index, byClientId: bundleCache.byClientId };
  }

  const data = await loadFastLinkBundleData();
  const index = buildIndexFromLinks(data);
  const byClientId = buildByClientIdFromLinks(data);
  bundleCache = { at: now, index, byClientId };
  indexCache = { at: now, index };
  return { index, byClientId };
}

/** 검토표 초기 로드용 — index + clientId 역매핑을 한 번에 구축 */
export async function buildClientLinksBundle(): Promise<{
  index: Record<string, ClientLinkEntry>;
  byClientId: Record<string, ClientReviewKeyEntry[]>;
}> {
  return buildClientLinksBundleFast();
}

/** 검토표 초기 로드용 — 수임처 연결 맵 일괄 구축 */
export async function buildClientLinksIndex(): Promise<Record<string, ClientLinkEntry>> {
  const { index } = await buildClientLinksBundle();
  return index;
}

async function getCachedClientLinksIndex(): Promise<Record<string, ClientLinkEntry>> {
  const now = Date.now();
  if (indexCache && now - indexCache.at < INDEX_TTL_MS) return indexCache.index;
  const index = await buildClientLinksIndex();
  indexCache = { at: now, index };
  return index;
}

export async function findClientsByCompanyLinkKey(
  key: string,
  options?: { owner?: string; personName?: string },
) {
  const normalized = normalizeReviewLookupKey(key);
  if (!normalized) return [];

  const shared = await loadReviewLinkSharedData();
  const scopedKey =
    options?.owner != null && !normalized.includes('/')
      ? scopedReviewKey(options.owner, companyLinkKey(normalized), options.personName)
      : normalized.includes('/')
        ? normalized
        : null;

  const index = await getCachedClientLinksIndex();
  if (scopedKey) {
    const scopedHit =
      index[scopedKey] ??
      lookupIndexEntry(index, scopedKey, { owner: options?.owner });
    if (scopedHit?.clients.length) {
      return getClientsByIds(scopedHit.clients.map(c => c.id));
    }
  }

  const indexed = lookupIndexEntry(index, normalized, {
    owner: options?.owner,
    allowLegacy: !options?.owner,
  });
  if (indexed?.clients.length) {
    return getClientsByIds(indexed.clients.map(c => c.id));
  }

  if (scopedKey) {
    const manualScoped = await listLinksByReviewKey(scopedKey);
    if (manualScoped.length) {
      return getClientsByIds(manualScoped.map(l => l.clientId));
    }
  }

  const manualLinks = await listLinksByReviewKey(normalized);
  if (manualLinks.length) {
    return getClientsByIds(manualLinks.map(l => l.clientId));
  }

  const entry = findReviewEntry(shared, {
    key: normalized,
    owner: options?.owner,
    personName: options?.personName,
  });
  if (entry) {
    const match = matchReviewEntry(entry, shared.matchIndex);
    if (match.clientIds.length) {
      return getClientsByIds(match.clientIds);
    }
  }

  return [];
}

/** @deprecated 단일 반환 — 첫 번째만 */
export async function findClientByCompanyLinkKey(key: string) {
  const clients = await findClientsByCompanyLinkKey(key);
  return clients[0] ?? null;
}

export async function getClientLinkSuggestions(
  reviewKey: string,
  options?: { owner?: string; personName?: string },
) {
  const normalized = normalizeReviewLookupKey(reviewKey);
  if (!normalized) return [];

  const shared = await loadReviewLinkSharedData();
  const entry = findReviewEntry(shared, {
    key: normalized,
    owner: options?.owner,
    personName: options?.personName,
  });
  if (!entry) return [];

  return matchReviewEntry(entry, shared.matchIndex).suggestions;
}

export async function resolveClientLink(
  key: string,
  options?: { owner?: string; personName?: string },
) {
  const normalized = normalizeReviewLookupKey(key);
  if (!normalized) {
    return { key: '', clients: [] as LinkedClient[], primary: null, manual: false };
  }

  const scopedKey =
    options?.owner != null && !normalized.includes('/')
      ? scopedReviewKey(options.owner, companyLinkKey(normalized), options.personName)
      : normalized.includes('/')
        ? normalized
        : null;

  const index = await getCachedClientLinksIndex();
  const lookupKeys = [...new Set([scopedKey, key, normalized].filter(Boolean) as string[])];

  for (const lookupKey of lookupKeys) {
    const entry = lookupIndexEntry(index, lookupKey, {
      owner: options?.owner,
      allowLegacy: !options?.owner,
    });
    if (entry) {
      return {
        key: lookupKey,
        clients: entry.clients,
        primary: entry.primary,
        manual: entry.manual,
      };
    }
  }

  for (const lookupKey of lookupKeys) {
    const manualLinks = await listLinksByReviewKey(lookupKey);
    if (manualLinks.length) {
      const clients = (await getClientsByIds(manualLinks.map(l => l.clientId))).map(toLinkedClient);
      return {
        key: lookupKey,
        clients,
        primary: clients[0] ?? null,
        manual: true,
      };
    }
  }

  const matched = await findClientsByCompanyLinkKey(normalized, options);
  const clients = matched.map(toLinkedClient);
  return {
    key: scopedKey ?? normalized,
    clients,
    primary: clients[0] ?? null,
    manual: false,
  };
}

export { buildPrimaryClientLinksByKey };

export type ClientReviewKeyEntry = {
  reviewKey: string;
  reviewName: string;
  owners: string[];
  taxKinds: ReviewTaxKind[];
  focusOwner?: string;
  focusRow?: number;
};

export type ClientReviewLinkContext = {
  reviewKey: string;
  reviewName: string;
  clientId: string | null;
  primaryClientId: string | null;
  linkedClientIds: string[];
  taxKinds: ReviewTaxKind[];
  owners: string[];
  sources: { taxKind: ReviewTaxKind; sheetName: string; owner: string; row?: number }[];
  filingTax: 'comprehensive' | 'corporate';
  matchMethod: MatchMethod | 'manual' | null;
  linked: boolean;
  manual: boolean;
};

function entryToSources(entry: ReviewCompanyEntry | undefined) {
  return (entry?.sources ?? []).map(s => ({
    taxKind: s.taxKind,
    sheetName: s.sheetName,
    owner: s.owner,
    row: s.row,
  }));
}

function resolveLinkContextFromShared(
  shared: ReviewLinkSharedData,
  input: { reviewKey?: string; clientId?: string; owner?: string; personName?: string },
): ClientReviewLinkContext | null {
  let reviewKey = input.reviewKey ? normalizeReviewLookupKey(input.reviewKey) : '';
  let clientId = input.clientId?.trim() ?? '';

  if (input.owner && reviewKey && !reviewKey.includes('/')) {
    const scoped = scopedReviewKey(input.owner, companyLinkKey(reviewKey), input.personName);
    if (shared.entryByKey.has(scoped)) reviewKey = scoped;
  }

  if (!reviewKey && clientId) {
    const fromClient = shared.manualLinks.filter(l => l.clientId === clientId);
    if (fromClient.length) reviewKey = fromClient[0].reviewKey;
    if (!reviewKey) {
      const client = shared.clientById.get(clientId);
      if (client) {
        const key = companyLinkKey(client.companyName);
        if (shared.entryByKey.has(key)) reviewKey = key;
      }
    }
  }

  if (reviewKey && !clientId) {
    const manual = shared.manualLinks
      .filter(l => l.reviewKey === reviewKey)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (manual.length) clientId = manual[0].clientId;
    else {
      const entry =
        shared.entryByKey.get(reviewKey) ??
        findReviewEntry(shared, {
          key: reviewKey,
          owner: input.owner,
          personName: input.personName,
        });
      if (entry) {
        const match = matchReviewEntry(entry, shared.matchIndex);
        if (match.clientIds.length) clientId = match.clientIds[0];
      }
    }
  }

  if (!reviewKey) return null;

  const entry =
    shared.entryByKey.get(reviewKey) ??
    findReviewEntry(shared, {
      key: reviewKey,
      owner: input.owner,
      personName: input.personName,
    });
  const manualLinks = shared.manualLinks
    .filter(l => l.reviewKey === reviewKey)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const linkedClientIds = manualLinks.length
    ? manualLinks.map(l => l.clientId)
    : (() => {
        if (!entry) return [];
        const match = matchReviewEntry(entry, shared.matchIndex);
        return match.clientIds;
      })();

  const primaryClientId = linkedClientIds[0] ?? null;
  const resolvedClientId = clientId || primaryClientId;

  return {
    reviewKey,
    reviewName: entry?.reviewName ?? reviewKey,
    clientId: resolvedClientId,
    primaryClientId,
    linkedClientIds,
    taxKinds: entry?.taxKinds ?? [],
    owners: entry?.owners ?? [],
    sources: entryToSources(entry),
    filingTax: entry ? filingTaxForEntry(entry) : 'corporate',
    matchMethod: (manualLinks[0]?.matchMethod as MatchMethod | 'manual' | undefined) ?? null,
    linked: linkedClientIds.length > 0,
    manual: manualLinks.length > 0,
  };
}

export async function resolveLinkContext(input: {
  reviewKey?: string;
  clientId?: string;
  owner?: string;
  personName?: string;
}): Promise<ClientReviewLinkContext | null> {
  const cacheKey = input.reviewKey
    ? `k:${normalizeReviewLookupKey(input.reviewKey)}:${input.owner ?? ''}:${input.personName ?? ''}`
    : `c:${input.clientId?.trim() ?? ''}`;
  const hit = linkContextCache.get(cacheKey);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.value;

  const shared = await loadReviewLinkSharedData();
  const result = resolveLinkContextFromShared(shared, input);
  linkContextCache.set(cacheKey, { at: Date.now(), value: result });
  return result;
}

/** filing-check 등 — clientId → 연결된 검토표 키 (DB 우선) */
export async function buildClientIdToReviewKeysMap(): Promise<Record<string, ClientReviewKeyEntry[]>> {
  const { byClientId } = await buildClientLinksBundle();
  return byClientId;
}
