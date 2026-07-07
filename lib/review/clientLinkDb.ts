import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { reviewClientLinks } from '@/db/schema';

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
}) {
  const db = getDb();
  const now = new Date();
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
