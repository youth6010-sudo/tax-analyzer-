import { getManagerMatchNames } from '@/app/utils/managerMatch';
import type { ClientRecord } from '@/app/types/client';
import { groupComprehensiveFilingTargets } from '@/lib/comprehensiveFilingGroups';
import {
  buildAltLinkKeys,
  companyLinkKey,
  coreCompanyKey,
} from '@/lib/review/companyKey';
import type { ReviewCompanyEntry } from '@/lib/review/reviewCompanyIndex';

export type MatchMethod =
  | 'exact'
  | 'income_rep'
  | 'income_group'
  | 'manager_name'
  | 'unique_prefix'
  | 'core_exact'
  | 'contains_scoped'
  | 'manager_fuzzy'
  | 'manual';

export type MatchSuggestion = {
  clientId: string;
  companyName: string;
  manager: string;
  businessNo: string;
  reason: string;
};

export type MatchResult = {
  reviewKey: string;
  reviewName: string;
  clientIds: string[];
  method: MatchMethod | null;
  confidence: 'high' | 'low' | null;
  suggestions: MatchSuggestion[];
};

function managerMatches(owner: string, clientManager: string): boolean {
  const o = owner.trim();
  const m = clientManager.trim();
  if (!o || !m) return false;
  if (o === m) return true;
  const ownerNames = new Set([o, ...getManagerMatchNames(o)]);
  const mgrNames = new Set([m, ...getManagerMatchNames(m)]);
  for (const n of ownerNames) {
    if (mgrNames.has(n)) return true;
  }
  return false;
}

function uniqClients(clients: ClientRecord[]): ClientRecord[] {
  const seen = new Set<string>();
  const out: ClientRecord[] = [];
  for (const c of clients) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

function toSuggestion(c: ClientRecord, reason: string): MatchSuggestion {
  return {
    clientId: c.id,
    companyName: c.companyName,
    manager: c.manager,
    businessNo: c.businessNo,
    reason,
  };
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dist[i][0] = i;
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
    }
  }
  return dist[a.length][b.length];
}

export type ClientMatchIndex = {
  byCompanyKey: Map<string, ClientRecord[]>;
  byCoreKey: Map<string, ClientRecord[]>;
  byRepKey: Map<string, ClientRecord[]>;
  groups: ReturnType<typeof groupComprehensiveFilingTargets>;
};

function pushToMap(map: Map<string, ClientRecord[]>, key: string, client: ClientRecord) {
  if (key.length < 2) return;
  const list = map.get(key) ?? [];
  list.push(client);
  map.set(key, list);
}

export function buildClientMatchIndex(clients: ClientRecord[]): ClientMatchIndex {
  const byCompanyKey = new Map<string, ClientRecord[]>();
  const byCoreKey = new Map<string, ClientRecord[]>();
  const byRepKey = new Map<string, ClientRecord[]>();

  for (const client of clients) {
    const keys = new Set([
      ...buildAltLinkKeys(client.companyName),
      companyLinkKey(client.companyName),
      coreCompanyKey(client.companyName),
    ]);
    for (const key of keys) {
      pushToMap(byCompanyKey, key, client);
      const core = coreCompanyKey(key) || key;
      pushToMap(byCoreKey, core, client);
    }
    const repKey = companyLinkKey(client.representative);
    if (repKey.length >= 2) pushToMap(byRepKey, repKey, client);
  }

  return {
    byCompanyKey,
    byCoreKey,
    byRepKey,
    groups: groupComprehensiveFilingTargets(clients),
  };
}

function candidatesForKey(index: ClientMatchIndex, key: string): ClientRecord[] {
  return uniqClients(index.byCompanyKey.get(key) ?? []);
}

function candidatesForCoreKey(index: ClientMatchIndex, key: string): ClientRecord[] {
  const core = coreCompanyKey(key) || key;
  return uniqClients(index.byCoreKey.get(core) ?? []);
}

function filterByOwnerStrict(candidates: ClientRecord[], owners: string[]): ClientRecord[] {
  if (!owners.length) return [];
  return candidates.filter(c => owners.some(o => managerMatches(o, c.manager)));
}

function entryCoreKeys(entry: ReviewCompanyEntry): string[] {
  const keys = new Set<string>();
  const labels = [
    entry.reviewName,
    entry.companyLabel,
    entry.personName,
    ...(entry.altKeys ?? []),
    entry.reviewKey,
  ];
  for (const label of labels) {
    if (!label) continue;
    const core = coreCompanyKey(label);
    if (core.length >= 2) keys.add(core);
  }
  return [...keys];
}

function uniquePrefixMatch(
  index: ClientMatchIndex,
  entry: ReviewCompanyEntry,
): ClientRecord[] | null {
  const keys = entry.altKeys?.length ? entry.altKeys : [entry.reviewKey];
  for (const key of keys) {
    if (key.length < 4) continue;
    const hits: ClientRecord[] = [];
    for (const [ck, list] of index.byCompanyKey) {
      if (ck.length < 4) continue;
      if (ck.includes(key) || key.includes(ck)) hits.push(...list);
    }
    const scoped = filterByOwnerStrict(uniqClients(hits), entry.owners);
    if (scoped.length === 1) return scoped;
  }
  return null;
}

function coreExactMatch(index: ClientMatchIndex, entry: ReviewCompanyEntry): ClientRecord[] | null {
  if (!entry.owners.length) return null;
  const cores = entryCoreKeys(entry);
  for (const core of cores) {
    const hits = candidatesForCoreKey(index, core);
    const scoped = filterByOwnerStrict(hits, entry.owners);
    if (scoped.length === 1) return scoped;
  }
  return null;
}

function containsScopedMatch(index: ClientMatchIndex, entry: ReviewCompanyEntry): ClientRecord[] | null {
  const cores = entryCoreKeys(entry).filter(c => c.length >= 4);
  if (!cores.length || !entry.owners.length) return null;

  const hits: ClientRecord[] = [];
  for (const entryCore of cores) {
    for (const [clientCore, list] of index.byCoreKey) {
      if (clientCore.length < 4) continue;
      if (clientCore.includes(entryCore) || entryCore.includes(clientCore)) {
        hits.push(...list);
      }
    }
  }
  const scoped = filterByOwnerStrict(uniqClients(hits), entry.owners);
  return scoped.length === 1 ? scoped : null;
}

function managerFuzzyMatch(index: ClientMatchIndex, entry: ReviewCompanyEntry): ClientRecord[] | null {
  const cores = entryCoreKeys(entry).filter(c => c.length >= 3);
  if (!cores.length || !entry.owners.length) return null;

  const hits: ClientRecord[] = [];
  for (const entryCore of cores) {
    for (const [clientCore, list] of index.byCoreKey) {
      if (clientCore.length < 3) continue;
      if (editDistance(entryCore, clientCore) <= 1) hits.push(...list);
    }
  }
  const scoped = filterByOwnerStrict(uniqClients(hits), entry.owners);
  return scoped.length === 1 ? scoped : null;
}

function incomeGroupMatch(index: ClientMatchIndex, entry: ReviewCompanyEntry): ClientRecord[] | null {
  if (!entry.taxKinds.includes('income')) return null;
  const keys = new Set(entry.altKeys?.length ? entry.altKeys : [entry.reviewKey]);
  if (entry.personName) {
    for (const k of buildAltLinkKeys(entry.personName)) keys.add(k);
  }

  for (const g of index.groups) {
    if (g.clients.length < 2) continue;
    const hit = g.clients.some(c => {
      for (const k of buildAltLinkKeys(c.companyName, c.representative)) {
        if (keys.has(k)) return true;
      }
      return false;
    });
    if (hit) {
      const scoped = filterByOwnerStrict(g.clients, entry.owners);
      if (scoped.length) return scoped;
      return null;
    }
  }
  return null;
}

function incomeRepMatch(index: ClientMatchIndex, entry: ReviewCompanyEntry): ClientRecord[] | null {
  if (!entry.taxKinds.includes('income')) return null;
  const personKeys = entry.personName ? buildAltLinkKeys(entry.personName) : [];
  if (!personKeys.length) return null;

  const hits: ClientRecord[] = [];
  for (const pk of personKeys) {
    hits.push(...(index.byRepKey.get(pk) ?? []));
    hits.push(...candidatesForKey(index, pk));
  }
  const uniq = uniqClients(hits);
  if (!uniq.length) return null;
  const scoped = filterByOwnerStrict(uniq, entry.owners);
  if (scoped.length === 1) return scoped;
  if (scoped.length > 1) return scoped;
  return null;
}

export function matchReviewEntry(
  entry: ReviewCompanyEntry,
  index: ClientMatchIndex,
): MatchResult {
  const base: MatchResult = {
    reviewKey: entry.reviewKey,
    reviewName: entry.reviewName,
    clientIds: [],
    method: null,
    confidence: null,
    suggestions: [],
  };

  const lookupKeys = entry.altKeys?.length ? entry.altKeys : [entry.reviewKey];

  // 1. exact
  for (const key of lookupKeys) {
    const exact = candidatesForKey(index, key);
    if (!exact.length) continue;

    if (entry.owners.length) {
      const mgrScoped = filterByOwnerStrict(exact, entry.owners);
      if (mgrScoped.length === 1) {
        return { ...base, clientIds: mgrScoped.map(c => c.id), method: 'exact', confidence: 'high' };
      }
      if (mgrScoped.length > 1) {
        return {
          ...base,
          clientIds: mgrScoped.map(c => c.id),
          method: 'manager_name',
          confidence: 'high',
        };
      }
      continue;
    }

    if (exact.length === 1) {
      return { ...base, clientIds: exact.map(c => c.id), method: 'exact', confidence: 'high' };
    }
  }

  // 2. income_rep
  const repHits = incomeRepMatch(index, entry);
  if (repHits?.length) {
    return { ...base, clientIds: repHits.map(c => c.id), method: 'income_rep', confidence: 'high' };
  }

  // 3. income_group
  const groupHits = incomeGroupMatch(index, entry);
  if (groupHits?.length) {
    return { ...base, clientIds: groupHits.map(c => c.id), method: 'income_group', confidence: 'high' };
  }

  // 4. manager_name
  const ambiguousPool: ClientRecord[] = [];
  for (const key of lookupKeys) ambiguousPool.push(...candidatesForKey(index, key));
  const uniqAmbiguous = uniqClients(ambiguousPool);
  if (uniqAmbiguous.length > 1 && entry.owners.length) {
    const mgrHits = filterByOwnerStrict(uniqAmbiguous, entry.owners);
    if (mgrHits.length) {
      return {
        ...base,
        clientIds: mgrHits.map(c => c.id),
        method: 'manager_name',
        confidence: 'high',
      };
    }
  }

  // 5. unique_prefix (담당자 스코프)
  const prefixHit = uniquePrefixMatch(index, entry);
  if (prefixHit?.length === 1) {
    return {
      ...base,
      clientIds: prefixHit.map(c => c.id),
      method: 'unique_prefix',
      confidence: 'high',
    };
  }

  // 6. core_exact
  const coreHit = coreExactMatch(index, entry);
  if (coreHit?.length) {
    return {
      ...base,
      clientIds: coreHit.map(c => c.id),
      method: 'core_exact',
      confidence: 'high',
    };
  }

  // 7. contains_scoped
  const containsHit = containsScopedMatch(index, entry);
  if (containsHit?.length === 1) {
    return {
      ...base,
      clientIds: containsHit.map(c => c.id),
      method: 'contains_scoped',
      confidence: 'high',
    };
  }

  // 8. manager_fuzzy
  const fuzzyHit = managerFuzzyMatch(index, entry);
  if (fuzzyHit?.length === 1) {
    return {
      ...base,
      clientIds: fuzzyHit.map(c => c.id),
      method: 'manager_fuzzy',
      confidence: 'high',
    };
  }

  // suggestions
  const suggestionPool = uniqClients([
    ...lookupKeys.flatMap(k => candidatesForKey(index, k)),
    ...entryCoreKeys(entry).flatMap(c => candidatesForCoreKey(index, c)),
    ...(entry.personName
      ? uniqClients(index.byRepKey.get(companyLinkKey(entry.personName)) ?? [])
      : []),
  ]);
  const suggestions = suggestionPool.slice(0, 8).map(c =>
    toSuggestion(
      c,
      entry.owners.some(o => managerMatches(o, c.manager)) ? '담당자 일치' : '상호 유사',
    ),
  );

  return { ...base, suggestions };
}

export function matchAllReviewEntries(
  entries: ReviewCompanyEntry[],
  clients: ClientRecord[],
  options?: { skipReviewKeys?: Set<string> },
): MatchResult[] {
  const index = buildClientMatchIndex(clients);
  const skip = options?.skipReviewKeys ?? new Set<string>();
  return entries
    .filter(e => !skip.has(e.reviewKey))
    .map(e => matchReviewEntry(e, index));
}

export function filingTaxForEntry(entry: Pick<ReviewCompanyEntry, 'taxKinds'>): 'comprehensive' | 'corporate' {
  if (entry.taxKinds.includes('income')) return 'comprehensive';
  return 'corporate';
}
