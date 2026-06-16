import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lunchSpotRequests } from '@/db/schema';

export type LunchSpotRequestView = {
  id: string;
  name: string;
  note: string;
  requestedByName: string;
  status: string;
  createdAt: string;
};

function toView(row: typeof lunchSpotRequests.$inferSelect): LunchSpotRequestView {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    requestedByName: row.requestedByName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createLunchSpotRequest(input: {
  name: string;
  note?: string;
  requestedBy?: string;
  requestedByName?: string;
}): Promise<LunchSpotRequestView> {
  const db = getDb();
  const [row] = await db
    .insert(lunchSpotRequests)
    .values({
      name: input.name.trim(),
      note: input.note?.trim() ?? '',
      requestedBy: input.requestedBy ?? null,
      requestedByName: input.requestedByName?.trim() ?? '',
      status: 'pending',
    })
    .returning();
  return toView(row);
}

export async function listPendingLunchSpotRequests(limit = 20): Promise<LunchSpotRequestView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(lunchSpotRequests)
    .where(eq(lunchSpotRequests.status, 'pending'))
    .orderBy(desc(lunchSpotRequests.createdAt))
    .limit(limit);
  return rows.map(toView);
}
