import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, taxFilingChecks } from '@/db/schema';
import type { TaxTypeId } from '@/app/config/taxTypes';

export type TaxFilingCheckRecord = {
  id: string;
  clientId: string;
  companyName: string;
  manager: string;
  taxType: TaxTypeId;
  periodKey: string;
  status: 'pending' | 'done' | 'na';
  blueholeCaseId: string;
  acceptanceCount: number | null;
  notes: string;
  checkedBy: string;
  checkedAt: string | null;
};

function toRecord(
  row: typeof taxFilingChecks.$inferSelect,
  client: { companyName: string; manager: string },
): TaxFilingCheckRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: client.companyName,
    manager: client.manager,
    taxType: row.taxType as TaxTypeId,
    periodKey: row.periodKey,
    status: row.status as TaxFilingCheckRecord['status'],
    blueholeCaseId: row.blueholeCaseId,
    acceptanceCount: row.acceptanceCount,
    notes: row.notes,
    checkedBy: row.checkedBy,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}

export async function listFilingChecksForManager(
  managerName: string,
  taxType: TaxTypeId,
  periodKey: string,
): Promise<TaxFilingCheckRecord[]> {
  const db = getDb();

  const eligible = await db
    .select()
    .from(clients)
    .where(and(eq(clients.status, 'active'), eq(clients.manager, managerName)));

  const targets = eligible.filter(c => {
    const types = (c.taxTypes as string[]) ?? [];
    return types.includes(taxType);
  });

  for (const c of targets) {
    await db
      .insert(taxFilingChecks)
      .values({ clientId: c.id, taxType, periodKey, status: 'pending' })
      .onConflictDoNothing({
        target: [taxFilingChecks.clientId, taxFilingChecks.taxType, taxFilingChecks.periodKey],
      });
  }

  const refreshed = await db
    .select()
    .from(taxFilingChecks)
    .where(and(eq(taxFilingChecks.taxType, taxType), eq(taxFilingChecks.periodKey, periodKey)));

  const clientMap = new Map(targets.map(c => [c.id, c]));
  return refreshed
    .filter(r => clientMap.has(r.clientId))
    .map(r => toRecord(r, clientMap.get(r.clientId)!))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
}

export async function updateFilingCheck(
  id: string,
  patch: {
    status?: 'pending' | 'done' | 'na';
    blueholeCaseId?: string;
    acceptanceCount?: number | null;
    notes?: string;
    checkedBy?: string;
  },
): Promise<TaxFilingCheckRecord> {
  const db = getDb();
  const update: Partial<typeof taxFilingChecks.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === 'done') {
      update.checkedAt = new Date();
      if (patch.checkedBy) update.checkedBy = patch.checkedBy;
    }
  }
  if (patch.blueholeCaseId !== undefined) update.blueholeCaseId = patch.blueholeCaseId.trim();
  if (patch.acceptanceCount !== undefined) update.acceptanceCount = patch.acceptanceCount;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.checkedBy !== undefined) update.checkedBy = patch.checkedBy;

  const [row] = await db.update(taxFilingChecks).set(update).where(eq(taxFilingChecks.id, id)).returning();
  if (!row) throw new Error('NOT_FOUND');

  const [client] = await db.select().from(clients).where(eq(clients.id, row.clientId)).limit(1);
  if (!client) throw new Error('NOT_FOUND');
  return toRecord(row, client);
}
