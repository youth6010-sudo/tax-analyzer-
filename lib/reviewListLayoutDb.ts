import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { filingCheckSessions } from '@/db/schema';

const LAYOUT_MANAGER = '_reviewShared';
const LAYOUT_TAX = '_reviewListLayout';
const LAYOUT_PERIOD = 'v1';

export type ReviewListLayoutStore = Record<string, Array<string | number>>;
export type ReviewListWidthStore = Record<string, Record<string, number>>;

type LayoutPayload = {
  byKind?: ReviewListLayoutStore;
  widthsByKind?: ReviewListWidthStore;
};

function normalizeOrderStore(raw: ReviewListLayoutStore | null | undefined): ReviewListLayoutStore {
  if (!raw || typeof raw !== 'object') return {};
  const out: ReviewListLayoutStore = {};
  for (const [kind, ids] of Object.entries(raw)) {
    if (!Array.isArray(ids) || !ids.length) continue;
    out[kind] = ids
      .map(id => (typeof id === 'number' || typeof id === 'string' ? id : String(id)))
      .filter(id => id !== '' && id !== null && id !== undefined);
  }
  return out;
}

function normalizeWidthStore(raw: ReviewListWidthStore | null | undefined): ReviewListWidthStore {
  if (!raw || typeof raw !== 'object') return {};
  const out: ReviewListWidthStore = {};
  for (const [kind, map] of Object.entries(raw)) {
    if (!map || typeof map !== 'object') continue;
    const cleaned: Record<string, number> = {};
    for (const [colId, w] of Object.entries(map)) {
      const n = Number(w);
      if (Number.isFinite(n) && n >= 40 && n <= 800) cleaned[String(colId)] = Math.round(n);
    }
    if (Object.keys(cleaned).length) out[kind] = cleaned;
  }
  return out;
}

export async function getReviewListLayoutFull(): Promise<{
  layouts: ReviewListLayoutStore;
  widths: ReviewListWidthStore;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, LAYOUT_MANAGER),
        eq(filingCheckSessions.taxType, LAYOUT_TAX),
        eq(filingCheckSessions.periodKey, LAYOUT_PERIOD),
      ),
    )
    .limit(1);
  const raw = (rows[0]?.data ?? null) as LayoutPayload | null;
  return {
    layouts: normalizeOrderStore(raw?.byKind),
    widths: normalizeWidthStore(raw?.widthsByKind),
  };
}

/** @deprecated — layouts만 필요할 때 */
export async function getReviewListLayouts(): Promise<ReviewListLayoutStore> {
  return (await getReviewListLayoutFull()).layouts;
}

async function readExistingRow() {
  const db = getDb();
  return db
    .select()
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, LAYOUT_MANAGER),
        eq(filingCheckSessions.taxType, LAYOUT_TAX),
        eq(filingCheckSessions.periodKey, LAYOUT_PERIOD),
      ),
    )
    .limit(1);
}

async function writePayload(payload: LayoutPayload, userId?: string) {
  const db = getDb();
  const existing = await readExistingRow();
  if (existing[0]) {
    await db
      .update(filingCheckSessions)
      .set({
        data: payload as Record<string, unknown>,
        updatedByUserId: userId || null,
        updatedAt: new Date(),
      })
      .where(eq(filingCheckSessions.id, existing[0].id));
  } else {
    await db.insert(filingCheckSessions).values({
      manager: LAYOUT_MANAGER,
      taxType: LAYOUT_TAX,
      periodKey: LAYOUT_PERIOD,
      data: payload as Record<string, unknown>,
      updatedByUserId: userId || null,
    });
  }
}

export async function saveReviewListLayoutKind(
  kind: string,
  order: Array<string | number>,
  userId?: string,
): Promise<ReviewListLayoutStore> {
  const k = String(kind || '').trim();
  if (!k) return (await getReviewListLayoutFull()).layouts;

  const existing = await readExistingRow();
  const prevPayload = (existing[0]?.data ?? null) as LayoutPayload | null;
  const prev = normalizeOrderStore(prevPayload?.byKind);
  const widths = normalizeWidthStore(prevPayload?.widthsByKind);
  const next = {
    ...prev,
    [k]: order
      .map(id => (typeof id === 'number' || typeof id === 'string' ? id : String(id)))
      .filter(id => id !== '' && id !== null && id !== undefined),
  };
  await writePayload({ byKind: next, widthsByKind: widths }, userId);
  return next;
}

export async function saveReviewListWidthsKind(
  kind: string,
  widths: Record<string, number>,
  userId?: string,
): Promise<ReviewListWidthStore> {
  const k = String(kind || '').trim();
  if (!k) return (await getReviewListLayoutFull()).widths;

  const existing = await readExistingRow();
  const prevPayload = (existing[0]?.data ?? null) as LayoutPayload | null;
  const layouts = normalizeOrderStore(prevPayload?.byKind);
  const prevWidths = normalizeWidthStore(prevPayload?.widthsByKind);
  const cleaned: Record<string, number> = {};
  for (const [colId, w] of Object.entries(widths || {})) {
    const n = Number(w);
    if (Number.isFinite(n) && n >= 40 && n <= 800) cleaned[String(colId)] = Math.round(n);
  }
  const nextWidths = { ...prevWidths, [k]: cleaned };
  await writePayload({ byKind: layouts, widthsByKind: nextWidths }, userId);
  return nextWidths;
}
