import { count, desc, inArray } from 'drizzle-orm';

import { getDb } from '@/db';
import { reviewGridSheets } from '@/db/schema';

export type ReviewSheetPayload = {
  name: string;
  [key: string]: unknown;
};

let hasSheetsCache: { at: number; value: boolean } | null = null;
const HAS_SHEETS_TTL_MS = 30_000;

export async function hasReviewGridSheetsInDb(): Promise<boolean> {
  const now = Date.now();
  if (hasSheetsCache && now - hasSheetsCache.at < HAS_SHEETS_TTL_MS) {
    return hasSheetsCache.value;
  }
  try {
    const db = getDb();
    const [row] = await db.select({ n: count() }).from(reviewGridSheets);
    const value = Number(row?.n ?? 0) > 0;
    hasSheetsCache = { at: now, value };
    return value;
  } catch (e) {
    console.warn('[gridSheetDb] hasReviewGridSheetsInDb fallback:', e);
    hasSheetsCache = { at: now, value: false };
    return false;
  }
}

export function invalidateReviewGridSheetsCache() {
  hasSheetsCache = null;
}

export async function getReviewGridMetaFromDb() {
  try {
    const db = getDb();
    const [countRow] = await db.select({ n: count() }).from(reviewGridSheets);
    const sheetCount = Number(countRow?.n ?? 0);
    if (sheetCount === 0) return null;

    const [latest] = await db
      .select({
        version: reviewGridSheets.version,
        source: reviewGridSheets.source,
        importedAt: reviewGridSheets.importedAt,
      })
      .from(reviewGridSheets)
      .orderBy(desc(reviewGridSheets.importedAt))
      .limit(1);

    return {
      version: latest?.version ?? null,
      source: latest?.source ?? null,
      importedAt: latest?.importedAt?.toISOString() ?? null,
      sheetCount,
      missing: false,
    };
  } catch (e) {
    console.warn('[gridSheetDb] getReviewGridMetaFromDb fallback:', e);
    return null;
  }
}

export async function readReviewGridSheetsFromDb(names: string[]): Promise<ReviewSheetPayload[]> {
  const want = [...new Set(names.filter(Boolean))];
  if (!want.length) return [];

  const db = getDb();
  const rows = await db
    .select({ sheetName: reviewGridSheets.sheetName, sheetData: reviewGridSheets.sheetData })
    .from(reviewGridSheets)
    .where(inArray(reviewGridSheets.sheetName, want));

  const byName = new Map(rows.map(r => [r.sheetName, r.sheetData as ReviewSheetPayload]));
  return want.map(name => byName.get(name)).filter((s): s is ReviewSheetPayload => !!s);
}

export async function replaceReviewGridSheets(input: {
  version?: string | null;
  source?: string | null;
  importedAt?: Date;
  sheets: ReviewSheetPayload[];
}) {
  const db = getDb();
  const importedAt = input.importedAt ?? new Date();
  const version = input.version ?? null;
  const source = input.source ?? null;

  await db.transaction(async tx => {
    await tx.delete(reviewGridSheets);
    for (const sheet of input.sheets) {
      const name = sheet.name;
      if (!name) continue;
      await tx.insert(reviewGridSheets).values({
        sheetName: name,
        sheetData: sheet,
        version,
        source,
        importedAt,
      });
    }
  });

  invalidateReviewGridSheetsCache();
}
