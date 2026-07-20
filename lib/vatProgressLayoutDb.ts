import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { filingCheckSessions } from '@/db/schema';
import {
  layoutFromLegacyOrder,
  normalizeVatProgressLayout,
  type VatProgressColumnDef,
} from '@/lib/vatEntryProgress';

const LAYOUT_TAX = '_vatProgressLayout';
const LAYOUT_PERIOD = 'v1';
/** 검토자가 편집하는 공통 열 구성 — 전 담당자 동일 */
const SHARED_LAYOUT_MANAGER = '__shared__';

type LayoutPayload = {
  columns?: VatProgressColumnDef[];
  /** 예전 열 순서만 저장된 경우 */
  order?: string[];
};

export async function getVatProgressLayout(): Promise<VatProgressColumnDef[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, SHARED_LAYOUT_MANAGER),
        eq(filingCheckSessions.taxType, LAYOUT_TAX),
        eq(filingCheckSessions.periodKey, LAYOUT_PERIOD),
      ),
    )
    .limit(1);
  const raw = (rows[0]?.data ?? null) as LayoutPayload | null;
  if (raw?.columns?.length) return normalizeVatProgressLayout(raw.columns);
  if (raw?.order?.length) return layoutFromLegacyOrder(raw.order);
  return normalizeVatProgressLayout(null);
}

export async function saveVatProgressLayout(
  columns: VatProgressColumnDef[],
  userId?: string,
): Promise<VatProgressColumnDef[]> {
  const db = getDb();
  const normalized = normalizeVatProgressLayout(columns);
  const payload: LayoutPayload = { columns: normalized };

  const existing = await db
    .select({ id: filingCheckSessions.id })
    .from(filingCheckSessions)
    .where(
      and(
        eq(filingCheckSessions.manager, SHARED_LAYOUT_MANAGER),
        eq(filingCheckSessions.taxType, LAYOUT_TAX),
        eq(filingCheckSessions.periodKey, LAYOUT_PERIOD),
      ),
    )
    .limit(1);

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
      manager: SHARED_LAYOUT_MANAGER,
      taxType: LAYOUT_TAX,
      periodKey: LAYOUT_PERIOD,
      data: payload as Record<string, unknown>,
      updatedByUserId: userId || null,
    });
  }
  return normalized;
}
