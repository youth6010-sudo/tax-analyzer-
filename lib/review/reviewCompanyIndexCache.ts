import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { reviewCompanyIndexCache } from '@/db/schema';
import type { ReviewCompanyEntry } from '@/lib/review/reviewCompanyIndex';
import { buildReviewCompanyEntriesFresh } from '@/lib/review/reviewCompanyIndex';

const CACHE_ID = 'default';

export type CompanyIndexMeta = {
  ready: boolean;
  builtAt: string | null;
  entryCount: number;
};

export async function readCompanyIndexMeta(): Promise<CompanyIndexMeta> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        builtAt: reviewCompanyIndexCache.builtAt,
        entryCount: reviewCompanyIndexCache.entryCount,
      })
      .from(reviewCompanyIndexCache)
      .where(eq(reviewCompanyIndexCache.id, CACHE_ID))
      .limit(1);
    if (!row || row.entryCount <= 0) {
      return { ready: false, builtAt: null, entryCount: 0 };
    }
    return {
      ready: true,
      builtAt: row.builtAt.toISOString(),
      entryCount: row.entryCount,
    };
  } catch (e) {
    console.warn('[reviewCompanyIndexCache] readCompanyIndexMeta fallback:', e);
    return { ready: false, builtAt: null, entryCount: 0 };
  }
}

export async function readCachedCompanyEntries(): Promise<ReviewCompanyEntry[] | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ entries: reviewCompanyIndexCache.entries, entryCount: reviewCompanyIndexCache.entryCount })
      .from(reviewCompanyIndexCache)
      .where(eq(reviewCompanyIndexCache.id, CACHE_ID))
      .limit(1);
    if (!row || row.entryCount <= 0) return null;
    const list = row.entries as ReviewCompanyEntry[];
    return Array.isArray(list) ? list : null;
  } catch (e) {
    console.warn('[reviewCompanyIndexCache] readCachedCompanyEntries fallback:', e);
    return null;
  }
}

export async function rebuildCompanyIndexCache(): Promise<CompanyIndexMeta> {
  const entries = await buildReviewCompanyEntriesFresh();
  const db = getDb();
  const now = new Date();
  await db
    .insert(reviewCompanyIndexCache)
    .values({
      id: CACHE_ID,
      builtAt: now,
      entryCount: entries.length,
      entries,
    })
    .onConflictDoUpdate({
      target: reviewCompanyIndexCache.id,
      set: {
        builtAt: now,
        entryCount: entries.length,
        entries,
      },
    });
  return {
    ready: entries.length > 0,
    builtAt: now.toISOString(),
    entryCount: entries.length,
  };
}

export async function clearCompanyIndexCache(): Promise<void> {
  try {
    const db = getDb();
    await db.delete(reviewCompanyIndexCache).where(eq(reviewCompanyIndexCache.id, CACHE_ID));
  } catch (e) {
    console.warn('[reviewCompanyIndexCache] clearCompanyIndexCache fallback:', e);
  }
}
