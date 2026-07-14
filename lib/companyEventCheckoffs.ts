import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { companyEventCheckoffs } from '@/db/schema';
import type { CheckoffDetail } from '@/app/types/calendar';

export type CompanyEventCheckoffMap = Record<string, boolean>;
export type CompanyEventCheckoffDetailMap = Record<string, CheckoffDetail>;

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

export function checkoffsFromDetails(
  details: CompanyEventCheckoffDetailMap,
): CompanyEventCheckoffMap {
  const bools: CompanyEventCheckoffMap = {};
  for (const [name, d] of Object.entries(details)) {
    bools[name] = d.completed;
  }
  return bools;
}

export async function listCheckoffDetailsForEvents(
  eventIds: string[],
): Promise<Map<string, CompanyEventCheckoffDetailMap>> {
  const map = new Map<string, CompanyEventCheckoffDetailMap>();
  if (eventIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select()
    .from(companyEventCheckoffs)
    .where(inArray(companyEventCheckoffs.eventId, eventIds));

  for (const row of rows) {
    const existing = map.get(row.eventId) ?? {};
    existing[row.memberName] = {
      completed: row.completed,
      completedAt: toIso(row.completedAt),
    };
    map.set(row.eventId, existing);
  }
  return map;
}

/** @deprecated 상세 맵 권장 — 하위 호환 */
export async function listCheckoffsForEvents(
  eventIds: string[],
): Promise<Map<string, CompanyEventCheckoffMap>> {
  const details = await listCheckoffDetailsForEvents(eventIds);
  const map = new Map<string, CompanyEventCheckoffMap>();
  for (const [id, detail] of details) {
    map.set(id, checkoffsFromDetails(detail));
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
