import { and, asc, eq, ne } from 'drizzle-orm';

import { getDb } from '@/db';
import { reviewClientLinks } from '@/db/schema';
import type { MatchMethod } from '@/lib/review/clientMatch';

export async function listReviewClientLinks() {
  try {
    const db = getDb();
    return await db
      .select()
      .from(reviewClientLinks)
      .orderBy(asc(reviewClientLinks.reviewKey), asc(reviewClientLinks.sortOrder));
  } catch (e) {
    console.warn('[clientLinkDb] listReviewClientLinks fallback:', e);
    return [];
  }
}

export async function listLinksByReviewKey(reviewKey: string) {
  try {
    const db = getDb();
    return await db
      .select()
      .from(reviewClientLinks)
      .where(eq(reviewClientLinks.reviewKey, reviewKey))
      .orderBy(asc(reviewClientLinks.sortOrder));
  } catch {
    return [];
  }
}

export async function replaceReviewClientLinks(input: {
  reviewKey: string;
  reviewName: string;
  clientIds: string[];
  updatedBy: string | null;
  matchMethod?: MatchMethod | 'manual';
}) {
  const db = getDb();
  const now = new Date();
  const matchMethod = input.matchMethod ?? 'manual';
  await db.transaction(async tx => {
    await tx.delete(reviewClientLinks).where(eq(reviewClientLinks.reviewKey, input.reviewKey));
    for (let i = 0; i < input.clientIds.length; i++) {
      const clientId = input.clientIds[i];
      if (!clientId) continue;
      await tx.insert(reviewClientLinks).values({
        reviewKey: input.reviewKey,
        clientId,
        reviewName: input.reviewName,
        sortOrder: i,
        matchMethod,
        updatedBy: input.updatedBy,
        updatedAt: now,
      });
    }
  });
}

export async function addReviewClientLink(input: {
  reviewKey: string;
  clientId: string;
  reviewName: string;
  sortOrder?: number;
  updatedBy: string | null;
  matchMethod?: MatchMethod | 'manual';
}) {
  const db = getDb();
  const now = new Date();
  const existing = await listLinksByReviewKey(input.reviewKey);
  const sortOrder = input.sortOrder ?? existing.length;
  await db
    .insert(reviewClientLinks)
    .values({
      reviewKey: input.reviewKey,
      clientId: input.clientId,
      reviewName: input.reviewName,
      sortOrder,
      matchMethod: input.matchMethod ?? 'manual',
      updatedBy: input.updatedBy,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function removeReviewClientLink(reviewKey: string, clientId: string) {
  const db = getDb();
  await db
    .delete(reviewClientLinks)
    .where(
      and(eq(reviewClientLinks.reviewKey, reviewKey), eq(reviewClientLinks.clientId, clientId)),
    );
}

export async function deleteAllReviewClientLinks(reviewKey: string) {
  const db = getDb();
  await db.delete(reviewClientLinks).where(eq(reviewClientLinks.reviewKey, reviewKey));
}

/** 자동 연결만 삭제 — 수동 연결 유지 */
export async function deleteAutoReviewClientLinks() {
  const db = getDb();
  const links = await listReviewClientLinks();
  const autoCount = links.filter(l => l.matchMethod !== 'manual').length;
  if (!autoCount) return 0;
  await db.delete(reviewClientLinks).where(ne(reviewClientLinks.matchMethod, 'manual'));
  return autoCount;
}

/** rebuild 스크립트 — 전체 연결 초기화 */
export async function clearAllReviewClientLinks() {
  const db = getDb();
  await db.delete(reviewClientLinks);
}

/** reviewKey → 대표(매출) clientId */
export async function buildPrimaryClientLinksByKey(): Promise<Record<string, string>> {
  const links = await listReviewClientLinks();
  const out: Record<string, string> = {};
  for (const link of links) {
    if (out[link.reviewKey] === undefined) {
      out[link.reviewKey] = link.clientId;
    }
  }
  return out;
}

export async function listLinkedReviewKeys(): Promise<Set<string>> {
  const links = await listReviewClientLinks();
  return new Set(links.map(l => l.reviewKey));
}
