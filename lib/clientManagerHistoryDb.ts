import { desc, gte, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { clientManagerChanges } from '@/db/schema';
import type { ManagerChangeEntry } from '@/lib/clientManagerHistory';

export async function recordClientManagerChange(input: {
  clientId: string;
  previousManager: string;
  newManager: string;
  changedByUserId?: string | null;
  changedAt?: Date;
}): Promise<void> {
  const prev = input.previousManager.trim();
  const next = input.newManager.trim();
  if (prev === next) return;
  const db = getDb();
  await db.insert(clientManagerChanges).values({
    clientId: input.clientId,
    previousManager: prev,
    newManager: next,
    changedByUserId: input.changedByUserId ?? null,
    changedAt: input.changedAt ?? new Date(),
  });
}

/** 최근 변경 이력 (신고대상확인 일괄 로드) */
export async function listManagerChangesSince(since: Date): Promise<ManagerChangeEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      clientId: clientManagerChanges.clientId,
      previousManager: clientManagerChanges.previousManager,
      newManager: clientManagerChanges.newManager,
      changedAt: clientManagerChanges.changedAt,
    })
    .from(clientManagerChanges)
    .where(gte(clientManagerChanges.changedAt, since))
    .orderBy(desc(clientManagerChanges.changedAt));
  return rows.map(r => ({
    clientId: r.clientId,
    previousManager: r.previousManager,
    newManager: r.newManager,
    changedAt: r.changedAt.toISOString(),
  }));
}

export async function listManagerChangesForClients(
  clientIds: string[],
): Promise<ManagerChangeEntry[]> {
  if (clientIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      clientId: clientManagerChanges.clientId,
      previousManager: clientManagerChanges.previousManager,
      newManager: clientManagerChanges.newManager,
      changedAt: clientManagerChanges.changedAt,
    })
    .from(clientManagerChanges)
    .where(inArray(clientManagerChanges.clientId, clientIds))
    .orderBy(desc(clientManagerChanges.changedAt));
  return rows.map(r => ({
    clientId: r.clientId,
    previousManager: r.previousManager,
    newManager: r.newManager,
    changedAt: r.changedAt.toISOString(),
  }));
}
