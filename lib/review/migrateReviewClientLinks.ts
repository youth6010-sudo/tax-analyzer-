import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { listClients } from '@/lib/clientsDb';
import {
  companyLinkKey,
  legacyBaseKeyFromScopedReviewKey,
} from '@/lib/review/companyKey';
import {
  listReviewClientLinks,
  removeReviewClientLink,
  replaceReviewClientLinks,
} from '@/lib/review/clientLinkDb';
import type { ReviewCompanyEntry } from '@/lib/review/reviewCompanyIndex';
import { listReviewCompanyEntries } from '@/lib/review/reviewCompanyIndex';

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

export type MigrateReviewLinksResult = {
  migrated: number;
  skipped: { reviewKey: string; clientId: string; reason: string }[];
  conflicts: { reviewKey: string; clientId: string; candidates: string[] }[];
};

function resolveTargetEntry(
  linkReviewKey: string,
  clientId: string,
  entriesByBase: Map<string, ReviewCompanyEntry[]>,
  clientById: Map<string, { manager: string; companyName: string }>,
): ReviewCompanyEntry | null {
  const baseKey = linkReviewKey.includes('/')
    ? legacyBaseKeyFromScopedReviewKey(linkReviewKey)
    : linkReviewKey;
  const candidates = entriesByBase.get(baseKey) ?? [];
  if (!candidates.length) return null;

  if (linkReviewKey.includes('/')) {
    const exact = candidates.find(e => e.reviewKey === linkReviewKey);
    return exact ?? null;
  }

  if (candidates.length === 1) return candidates[0];

  const client = clientById.get(clientId);
  if (!client) return null;

  const mgrMatched = candidates.filter(e =>
    e.owners.some(o => managerMatches(o, client.manager)),
  );
  if (mgrMatched.length === 1) return mgrMatched[0];

  const nameMatched = candidates.filter(
    e => companyLinkKey(e.reviewName) === baseKey || e.altKeys?.includes(baseKey),
  );
  if (nameMatched.length === 1) return nameMatched[0];

  return null;
}

/** 레거시 reviewKey(상호만) → 담당자 스코프 키로 변환 */
export async function migrateReviewClientLinksToScoped(options?: {
  dryRun?: boolean;
}): Promise<MigrateReviewLinksResult> {
  const dryRun = options?.dryRun ?? false;
  const [links, entries, pool] = await Promise.all([
    listReviewClientLinks(),
    listReviewCompanyEntries(),
    listClients({ includeChurned: true }),
  ]);

  const clientById = new Map(pool.map(c => [c.id, c]));
  const entriesByBase = new Map<string, ReviewCompanyEntry[]>();
  for (const entry of entries) {
    const base = entry.baseKey ?? legacyBaseKeyFromScopedReviewKey(entry.reviewKey);
    const list = entriesByBase.get(base) ?? [];
    list.push(entry);
    entriesByBase.set(base, list);
  }

  const skipped: MigrateReviewLinksResult['skipped'] = [];
  const conflicts: MigrateReviewLinksResult['conflicts'] = [];
  const targetGroups = new Map<
    string,
    { reviewName: string; clientIds: string[]; matchMethod: string }
  >();
  const removals: { reviewKey: string; clientId: string }[] = [];

  for (const link of links) {
    const target = resolveTargetEntry(
      link.reviewKey,
      link.clientId,
      entriesByBase,
      clientById,
    );

    if (!target) {
      const baseKey = link.reviewKey.includes('/')
        ? legacyBaseKeyFromScopedReviewKey(link.reviewKey)
        : link.reviewKey;
      const cands = entriesByBase.get(baseKey) ?? [];
      if (!cands.length) {
        skipped.push({ reviewKey: link.reviewKey, clientId: link.clientId, reason: 'no_entry' });
      } else {
        conflicts.push({
          reviewKey: link.reviewKey,
          clientId: link.clientId,
          candidates: cands.map(c => c.reviewKey),
        });
        skipped.push({ reviewKey: link.reviewKey, clientId: link.clientId, reason: 'ambiguous' });
      }
      continue;
    }

    if (target.reviewKey === link.reviewKey) continue;

    removals.push({ reviewKey: link.reviewKey, clientId: link.clientId });

    const group = targetGroups.get(target.reviewKey) ?? {
      reviewName: target.reviewName,
      clientIds: [],
      matchMethod: link.matchMethod ?? 'manual',
    };
    if (!group.clientIds.includes(link.clientId)) {
      group.clientIds.push(link.clientId);
    }
    if (link.matchMethod === 'manual') group.matchMethod = 'manual';
    targetGroups.set(target.reviewKey, group);
  }

  let migrated = 0;
  if (!dryRun) {
    for (const [newKey, group] of targetGroups) {
      const existing = links.filter(l => l.reviewKey === newKey);
      const allIds = [...new Set([...group.clientIds, ...existing.map(l => l.clientId)])];
      await replaceReviewClientLinks({
        reviewKey: newKey,
        reviewName: group.reviewName,
        clientIds: allIds,
        updatedBy: null,
        matchMethod: group.matchMethod === 'manual' ? 'manual' : 'exact',
      });
      migrated += group.clientIds.length;
    }

    for (const rem of removals) {
      await removeReviewClientLink(rem.reviewKey, rem.clientId);
    }
  } else {
    for (const [, group] of targetGroups) {
      migrated += group.clientIds.length;
    }
  }

  return { migrated, skipped, conflicts };
}
