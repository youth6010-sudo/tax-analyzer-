import { desc, eq, and, or, isNull, ilike } from 'drizzle-orm';
import { getDb } from '@/db';
import { interimClosingSaves } from '@/db/schema';
import type { InterimClosingPayload } from '@/lib/interimClosingTypes';

export type InterimClosingSaveListItem = {
  id: string;
  clientId: string | null;
  companyName: string;
  year: number;
  baseMonth: number;
  manager: string;
  savedBy: string;
  savedAt: string;
};

export async function listInterimClosingSaves(opts: {
  clientId?: string;
  year?: number;
  companyName?: string;
  limit?: number;
}): Promise<InterimClosingSaveListItem[]> {
  const db = getDb();
  const lim = Math.min(100, Math.max(1, opts.limit ?? 50));
  const conditions = [];
  // clientId만 있으면 해당 거래처 + 회사명 일치(미연결 저장)까지 포함
  if (opts.clientId && opts.companyName?.trim()) {
    const name = opts.companyName.trim();
    conditions.push(
      or(
        eq(interimClosingSaves.clientId, opts.clientId),
        and(isNull(interimClosingSaves.clientId), ilike(interimClosingSaves.companyName, `%${name}%`)),
      )!,
    );
  } else if (opts.clientId) {
    conditions.push(eq(interimClosingSaves.clientId, opts.clientId));
  } else if (opts.companyName?.trim()) {
    conditions.push(ilike(interimClosingSaves.companyName, `%${opts.companyName.trim()}%`));
  }
  // year는 선택 — 미지정이면 전체 연도
  if (opts.year != null && Number.isFinite(opts.year)) {
    conditions.push(eq(interimClosingSaves.year, opts.year));
  }

  const rows = await db
    .select({
      id: interimClosingSaves.id,
      clientId: interimClosingSaves.clientId,
      companyName: interimClosingSaves.companyName,
      year: interimClosingSaves.year,
      baseMonth: interimClosingSaves.baseMonth,
      manager: interimClosingSaves.manager,
      savedBy: interimClosingSaves.savedBy,
      savedAt: interimClosingSaves.savedAt,
    })
    .from(interimClosingSaves)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(interimClosingSaves.savedAt))
    .limit(lim);

  return rows.map(r => ({
    id: r.id,
    clientId: r.clientId,
    companyName: r.companyName,
    year: r.year,
    baseMonth: r.baseMonth,
    manager: r.manager,
    savedBy: r.savedBy,
    savedAt: r.savedAt.toISOString(),
  }));
}

export async function getInterimClosingSave(id: string): Promise<{
  id: string;
  clientId: string | null;
  companyName: string;
  year: number;
  baseMonth: number;
  manager: string;
  savedBy: string;
  savedAt: string;
  payload: InterimClosingPayload;
} | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(interimClosingSaves)
    .where(eq(interimClosingSaves.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.companyName,
    year: row.year,
    baseMonth: row.baseMonth,
    manager: row.manager,
    savedBy: row.savedBy,
    savedAt: row.savedAt.toISOString(),
    payload: row.payload as unknown as InterimClosingPayload,
  };
}

export async function createInterimClosingSave(input: {
  clientId?: string | null;
  companyName: string;
  year: number;
  baseMonth: number;
  manager: string;
  payload: InterimClosingPayload;
  savedBy: string;
  savedByUserId?: string | null;
}): Promise<InterimClosingSaveListItem> {
  const db = getDb();
  const [row] = await db
    .insert(interimClosingSaves)
    .values({
      clientId: input.clientId || null,
      companyName: input.companyName,
      year: input.year,
      baseMonth: input.baseMonth,
      manager: input.manager,
      payload: input.payload as unknown as Record<string, unknown>,
      savedBy: input.savedBy,
      savedByUserId: input.savedByUserId || null,
    })
    .returning({
      id: interimClosingSaves.id,
      clientId: interimClosingSaves.clientId,
      companyName: interimClosingSaves.companyName,
      year: interimClosingSaves.year,
      baseMonth: interimClosingSaves.baseMonth,
      manager: interimClosingSaves.manager,
      savedBy: interimClosingSaves.savedBy,
      savedAt: interimClosingSaves.savedAt,
    });
  return {
    id: row!.id,
    clientId: row!.clientId,
    companyName: row!.companyName,
    year: row!.year,
    baseMonth: row!.baseMonth,
    manager: row!.manager,
    savedBy: row!.savedBy,
    savedAt: row!.savedAt.toISOString(),
  };
}

export async function deleteInterimClosingSave(id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(interimClosingSaves)
    .where(eq(interimClosingSaves.id, id))
    .returning({ id: interimClosingSaves.id });
  return deleted.length > 0;
}
