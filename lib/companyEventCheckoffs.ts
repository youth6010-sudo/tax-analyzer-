import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { companyEventCheckoffs } from '@/db/schema';

export type CompanyEventCheckoffMap = Record<string, boolean>;

export async function listCheckoffsForEvents(
  eventIds: string[],
): Promise<Map<string, CompanyEventCheckoffMap>> {
  const map = new Map<string, CompanyEventCheckoffMap>();
  if (eventIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select()
    .from(companyEventCheckoffs)
    .where(inArray(companyEventCheckoffs.eventId, eventIds));

  for (const row of rows) {
    const existing = map.get(row.eventId) ?? {};
    existing[row.memberName] = row.completed;
    map.set(row.eventId, existing);
  }
  return map;
}

export async function setCompanyEventCheckoff(
  eventId: string,
  memberName: string,
  completed: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .insert(companyEventCheckoffs)
    .values({
      eventId,
      memberName,
      completed,
      completedAt: completed ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [companyEventCheckoffs.eventId, companyEventCheckoffs.memberName],
      set: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });
}

export async function countUserCompletedCheckoffs(
  memberName: string,
  eventIds: string[],
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({ eventId: companyEventCheckoffs.eventId })
    .from(companyEventCheckoffs)
    .where(and(
      inArray(companyEventCheckoffs.eventId, eventIds),
      eq(companyEventCheckoffs.memberName, memberName),
      eq(companyEventCheckoffs.completed, true),
    ));
  return rows.length;
}
