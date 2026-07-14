import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { filingCheckSessions } from '@/db/schema';

const LAYOUT_MANAGER = '_reviewShared';
const LAYOUT_TAX = '_reviewListLayout';
const LAYOUT_PERIOD = 'v1';

export type ReviewListLayoutStore = Record<string, Array<string | number>>;

type LayoutPayload = {
  byKind?: ReviewListLayoutStore;
};

function normalizeStore(raw: ReviewListLayoutStore | null | undefined): ReviewListLayoutStore {
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

export async function getReviewListLayouts(): Promise<ReviewListLayoutStore> {
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
  return normalizeStore(raw?.byKind);
}

export async function saveReviewListLayoutKind(
  kind: string,
  order: Array<string | number>,
  userId?: string,
): Promise<ReviewListLayoutStore> {
  const db = getDb();
  const k = String(kind || '').trim();
  if (!k) return getReviewListLayouts();

  const existing = await db
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

  const prev = normalizeStore((existing[0]?.data as LayoutPayload | null)?.byKind);
  const next = {
    ...prev,
    [k]: order
      .map(id => (typeof id === 'number' || typeof id === 'string' ? id : String(id)))
      .filter(id => id !== '' && id !== null && id !== undefined),
  };
  const payload: LayoutPayload = { byKind: next };

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
  return next;
}
