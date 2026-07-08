import { buildCorpFeeIndex } from '@/lib/review/corpFeeIndex';
import { buildCorpTaxCompanyIndex } from '@/lib/review/corpTaxCompanyIndex';
import {
  legacyBaseKeyFromScopedReviewKey,
  scopedReviewKey,
} from '@/lib/review/companyKey';
import { listClients } from '@/lib/clientsDb';
import { listReviewClientLinks } from '@/lib/review/clientLinkDb';
import { buildIncomeCompanyIndex } from '@/lib/review/incomeCompanyIndex';
import {
  readCachedCompanyEntries,
  readCompanyIndexMeta,
  type CompanyIndexMeta,
} from '@/lib/review/reviewCompanyIndexCache';

export type ReviewTaxKind = 'income' | 'corp-tax' | 'corp-fee';

export type ReviewCompanySource = {
  taxKind: ReviewTaxKind;
  sheetName: string;
  owner: string;
  row?: number;
};

export type ReviewCompanyEntry = {
  reviewKey: string;
  reviewName: string;
  sources: ReviewCompanySource[];
  /** @deprecated 호환 — 대표 시트명 */
  source: string;
  taxKinds: ReviewTaxKind[];
  owners: string[];
  personName?: string;
  companyLabel?: string;
  altKeys?: string[];
  /** legacy 상호 키 (owner 제외) */
  baseKey?: string;
};

function findMergeKeyForOwnerBase(
  map: Map<string, ReviewCompanyEntry>,
  owner: string,
  baseKey: string,
): string | null {
  const corpKey = scopedReviewKey(owner, baseKey);
  if (map.has(corpKey)) return corpKey;
  const prefix = `${owner}/${baseKey}/`;
  for (const k of map.keys()) {
    if (k.startsWith(prefix)) return k;
  }
  return null;
}

function promoteCorpOnlyEntry(
  map: Map<string, ReviewCompanyEntry>,
  owner: string,
  baseKey: string,
  incomeScopedKey: string,
  personName?: string,
): void {
  const corpKey = scopedReviewKey(owner, baseKey);
  const existing = map.get(corpKey);
  if (!existing || existing.taxKinds.includes('income')) return;
  map.delete(corpKey);
  map.set(incomeScopedKey, {
    ...existing,
    reviewKey: incomeScopedKey,
    personName: personName ?? existing.personName,
    altKeys: [...new Set([...(existing.altKeys ?? []), incomeScopedKey, baseKey, corpKey])],
  });
}

function mergeEntry(
  map: Map<string, ReviewCompanyEntry>,
  reviewKey: string,
  reviewName: string,
  source: ReviewCompanySource,
  meta?: { personName?: string; companyLabel?: string; altKeys?: string[]; baseKey?: string },
) {
  const existing = map.get(reviewKey);
  if (!existing) {
    const baseKey = meta?.baseKey ?? legacyBaseKeyFromScopedReviewKey(reviewKey);
    const altKeys = [...new Set([reviewKey, baseKey, ...(meta?.altKeys ?? [])])];
    map.set(reviewKey, {
      reviewKey,
      reviewName,
      sources: [source],
      source: source.sheetName,
      taxKinds: [source.taxKind],
      owners: source.owner ? [source.owner] : [],
      personName: meta?.personName,
      companyLabel: meta?.companyLabel,
      altKeys,
      baseKey,
    });
    return;
  }
  if (!existing.sources.some(s => s.taxKind === source.taxKind && s.sheetName === source.sheetName)) {
    existing.sources.push(source);
  }
  if (!existing.taxKinds.includes(source.taxKind)) existing.taxKinds.push(source.taxKind);
  if (source.owner && !existing.owners.includes(source.owner)) existing.owners.push(source.owner);
  if (meta?.personName && !existing.personName) existing.personName = meta.personName;
  if (meta?.companyLabel && !existing.companyLabel) existing.companyLabel = meta.companyLabel;
  if (meta?.baseKey && !existing.baseKey) existing.baseKey = meta.baseKey;
  if (meta?.altKeys?.length) {
    const merged = new Set([
      ...(existing.altKeys ?? []),
      reviewKey,
      ...(existing.baseKey ? [existing.baseKey] : []),
      ...meta.altKeys,
    ]);
    existing.altKeys = [...merged];
  }
  existing.source = existing.sources.map(s => s.sheetName).filter(Boolean).join(', ');
}

/** 검토표 전 시트(종소·법인신고·법인조정료) 업체 목록 — 그리드에서 직접 빌드 */
export async function buildReviewCompanyEntriesFresh(): Promise<ReviewCompanyEntry[]> {
  const [incomeRows, corpTaxRows, corpFeeIndex] = await Promise.all([
    buildIncomeCompanyIndex(),
    buildCorpTaxCompanyIndex(),
    buildCorpFeeIndex(),
  ]);

  const map = new Map<string, ReviewCompanyEntry>();

  for (const row of incomeRows) {
    const baseKey = legacyBaseKeyFromScopedReviewKey(row.reviewKey);
    if (row.personName && row.owner) {
      promoteCorpOnlyEntry(map, row.owner, baseKey, row.reviewKey, row.personName);
    }
    mergeEntry(
      map,
      row.reviewKey,
      row.reviewName,
      {
        taxKind: 'income',
        sheetName: row.sheetName,
        owner: row.owner,
        row: row.row,
      },
      {
        personName: row.personName,
        companyLabel: row.companyLabel,
        altKeys: row.altKeys,
        baseKey,
      },
    );
  }

  for (const row of corpTaxRows) {
    const baseKey = legacyBaseKeyFromScopedReviewKey(row.reviewKey);
    const mergeKey =
      findMergeKeyForOwnerBase(map, row.owner, baseKey) ?? row.reviewKey;
    mergeEntry(map, mergeKey, row.reviewName, {
      taxKind: 'corp-tax',
      sheetName: row.sheetName,
      owner: row.owner,
      row: row.row,
    }, { baseKey, altKeys: [row.reviewKey, baseKey] });
  }

  for (const [baseKey, entry] of Object.entries(corpFeeIndex.byKey)) {
    const scopedKey = scopedReviewKey(entry.staff, baseKey);
    const mergeKey =
      findMergeKeyForOwnerBase(map, entry.staff, baseKey) ?? scopedKey;
    mergeEntry(map, mergeKey, entry.companyName, {
      taxKind: 'corp-fee',
      sheetName: corpFeeIndex.sheetName,
      owner: entry.staff,
    }, { baseKey, altKeys: [scopedKey, baseKey] });
  }

  return [...map.values()].sort((a, b) => a.reviewName.localeCompare(b.reviewName, 'ko'));
}

const ENTRIES_TTL_MS = 90_000;
let entriesCache: { at: number; entries: ReviewCompanyEntry[] } | null = null;
let entriesInflight: Promise<ReviewCompanyEntry[]> | null = null;

export async function listReviewCompanyEntries(): Promise<ReviewCompanyEntry[]> {
  const now = Date.now();
  if (entriesCache && now - entriesCache.at < ENTRIES_TTL_MS) return entriesCache.entries;

  const dbCached = await readCachedCompanyEntries();
  if (dbCached?.length) {
    entriesCache = { at: Date.now(), entries: dbCached };
    return dbCached;
  }

  if (entriesInflight) return entriesInflight;

  entriesInflight = buildReviewCompanyEntriesFresh().then(entries => {
    entriesCache = { at: Date.now(), entries };
    entriesInflight = null;
    return entries;
  });

  return entriesInflight;
}

export function invalidateReviewCompanyEntriesMemoryCache(): void {
  entriesCache = null;
  entriesInflight = null;
}

function stubEntry(reviewKey: string, reviewName: string): ReviewCompanyEntry {
  const baseKey = legacyBaseKeyFromScopedReviewKey(reviewKey);
  return {
    reviewKey,
    reviewName,
    sources: [],
    source: '',
    taxKinds: [],
    owners: [],
    baseKey,
    altKeys: [reviewKey, baseKey],
  };
}

export async function listUnlinkedReviewCompanies() {
  const now = Date.now();
  if (unlinkedCache && now - unlinkedCache.at < UNLINKED_TTL_MS) {
    return unlinkedCache.data;
  }
  if (unlinkedInflight) return unlinkedInflight;

  unlinkedInflight = loadUnlinkedReviewCompaniesFresh()
    .then(data => {
      unlinkedCache = { at: Date.now(), data };
      unlinkedInflight = null;
      return data;
    })
    .catch(err => {
      unlinkedInflight = null;
      throw err;
    });

  return unlinkedInflight;
}

export function invalidateUnlinkedReviewCompaniesCache(): void {
  unlinkedCache = null;
  unlinkedInflight = null;
}

const UNLINKED_TTL_MS = 90_000;
let unlinkedCache: {
  at: number;
  data: Awaited<ReturnType<typeof loadUnlinkedReviewCompaniesFresh>>;
} | null = null;
let unlinkedInflight: Promise<Awaited<ReturnType<typeof loadUnlinkedReviewCompaniesFresh>>> | null = null;

async function loadUnlinkedReviewCompaniesFresh() {
  const [cachedEntries, links, pool, indexMeta] = await Promise.all([
    readCachedCompanyEntries(),
    listReviewClientLinks(),
    listClients({ includeChurned: true }),
    readCompanyIndexMeta(),
  ]);

  const entries = cachedEntries ?? [];
  const entryByKey = new Map(entries.map(e => [e.reviewKey, e]));

  const linksByKey = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByKey.get(link.reviewKey) ?? [];
    list.push(link);
    linksByKey.set(link.reviewKey, list);
  }

  const linked: {
    entry: ReviewCompanyEntry;
    clientIds: string[];
    manual: boolean;
    matchMethod?: string;
  }[] = [];
  const linkedKeys = new Set<string>();

  for (const [reviewKey, rows] of linksByKey) {
    linkedKeys.add(reviewKey);
    const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    const matchMethod = sorted[0]?.matchMethod ?? 'manual';
    const entry =
      entryByKey.get(reviewKey) ??
      stubEntry(reviewKey, sorted[0]?.reviewName || reviewKey);
    linked.push({
      entry,
      clientIds: sorted.map(l => l.clientId),
      manual: matchMethod === 'manual',
      matchMethod,
    });
  }

  linked.sort((a, b) => a.entry.reviewName.localeCompare(b.entry.reviewName, 'ko'));

  const unlinked = entries.filter(e => !linkedKeys.has(e.reviewKey));

  return {
    unlinked,
    linked,
    links,
    suggestionsByKey: {} as Record<string, never>,
    clients: pool,
    indexMeta,
  };
}

export type { CompanyIndexMeta };
