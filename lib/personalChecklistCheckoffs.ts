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
      dismissedAt: toIso(row.dismissedAt),
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
      // 완료/대기 토글 시 확인 상태 초기화 — 다시 완료하면 각자 다시 확인
      dismissedAt: null,
    })
    .onConflictDoUpdate({
      target: [personalChecklistCheckoffs.itemId, personalChecklistCheckoffs.memberName],
      set: {
        completed,
        completedAt: completed ? new Date() : null,
        dismissedAt: null,
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

/** 협업자 본인만 — 처리완료 후 내 목록에서 숨김 (다른 사람 목록에 영향 없음) */
export async function dismissPersonalChecklistCheckoff(
  itemId: string,
  memberName: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(personalChecklistCheckoffs)
    .where(and(
      eq(personalChecklistCheckoffs.itemId, itemId),
      eq(personalChecklistCheckoffs.memberName, memberName),
    ))
    .limit(1);

  if (!row?.completed) {
    throw new Error('처리완료 후에만 확인할 수 있습니다.');
  }

  await db
    .update(personalChecklistCheckoffs)
    .set({ dismissedAt: new Date() })
    .where(and(
      eq(personalChecklistCheckoffs.itemId, itemId),
      eq(personalChecklistCheckoffs.memberName, memberName),
    ));
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
