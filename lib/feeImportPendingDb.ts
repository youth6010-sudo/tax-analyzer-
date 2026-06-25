import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { clientFeeImportPending, clients } from '@/db/schema';
import { updateClientFeeSummary } from '@/lib/clientsDb';

export async function listFeeImportPending() {
  const db = getDb();
  return db
    .select()
    .from(clientFeeImportPending)
    .orderBy(desc(clientFeeImportPending.createdAt));
}

export async function linkFeeImportPending(
  pendingId: string,
  clientId: string,
  adminUserId: string,
) {
  const db = getDb();
  const [pending] = await db
    .select()
    .from(clientFeeImportPending)
    .where(eq(clientFeeImportPending.id, pendingId))
    .limit(1);
  if (!pending) throw new Error('NOT_FOUND');

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  await updateClientFeeSummary(clientId, pending.feeSummary ?? null, adminUserId);
  await db.delete(clientFeeImportPending).where(eq(clientFeeImportPending.id, pendingId));

  return { clientId, feeSummary: pending.feeSummary };
}

export async function dismissFeeImportPending(pendingId: string) {
  const db = getDb();
  const [row] = await db
    .delete(clientFeeImportPending)
    .where(eq(clientFeeImportPending.id, pendingId))
    .returning();
  if (!row) throw new Error('NOT_FOUND');
  return row;
}
