import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistCheckoffs } from '@/db/schema';
import type { CheckoffDetail } from '@/app/types/calendar';

export type PersonalChecklistCheckoffDetailMap = Record<string, CheckoffDetail>;

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

export async function listCheckoffDetailsForPersonalItems(
  itemIds: string[],
): Promise<Map<string, PersonalChecklistCheckoffDetailMap>> {
  const map = new Map<string, PersonalChecklistCheckoffDetailMap>();
  if (itemIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select()
    .from(personalChecklistCheckoffs)
    .where(inArray(personalChecklistCheckoffs.itemId, itemIds));

  for (const row of rows) {
    const existing = map.get(row.itemId) ?? {};
    existing[row.memberName] = {
      completed: row.completed,
      completedAt: toIso(row.completedAt),
    };
    map.set(row.itemId, existing);
  }
  return map;
}

export async function setPersonalChecklistCheckoff(
  itemId: string,
  memberName: string,
  completed: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .insert(personalChecklistCheckoffs)
    .values({
      itemId,
      memberName,
      completed,
      completedAt: completed ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [personalChecklistCheckoffs.itemId, personalChecklistCheckoffs.memberName],
      set: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });

  // 완료 취소 시 해당 협업자 완료 알림을 항상 함께 제거
  if (!completed) {
    const { clearCompletionNotifications } = await import(
      '@/lib/personalChecklistNotifications'
    );
    await clearCompletionNotifications({ itemId, actorName: memberName });
  }
}

export async function countCompletedAmongMembers(
  itemId: string,
  memberNames: string[],
): Promise<number> {
  if (memberNames.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({ memberName: personalChecklistCheckoffs.memberName })
    .from(personalChecklistCheckoffs)
    .where(and(
      eq(personalChecklistCheckoffs.itemId, itemId),
      inArray(personalChecklistCheckoffs.memberName, memberNames),
      eq(personalChecklistCheckoffs.completed, true),
    ));
  return rows.length;
}
