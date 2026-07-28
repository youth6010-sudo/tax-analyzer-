import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistCheckoffs, personalChecklistItems, personalChecklistNotifications } from '@/db/schema';
import type { PersonalChecklistNotificationDto } from '@/app/types/calendar';

export type { PersonalChecklistNotificationDto };

export async function createCompletionNotification(input: {
  itemId: string;
  recipientName: string;
  actorName: string;
  title: string;
}): Promise<void> {
  if (!input.recipientName || input.recipientName === input.actorName) return;
  const db = getDb();
  // 같은 항목·협업자 미확인 알림이 겹치지 않게 정리 후 추가
  await db
    .delete(personalChecklistNotifications)
    .where(and(
      eq(personalChecklistNotifications.itemId, input.itemId),
      eq(personalChecklistNotifications.actorName, input.actorName),
      eq(personalChecklistNotifications.kind, 'completed'),
      eq(personalChecklistNotifications.recipientName, input.recipientName),
      isNull(personalChecklistNotifications.readAt),
    ));
  await db.insert(personalChecklistNotifications).values({
    itemId: input.itemId,
    recipientName: input.recipientName,
    actorName: input.actorName,
    kind: 'completed',
    title: input.title,
  });
}

/** 협업자가 완료를 취소하면 해당 완료 알림 제거 */
export async function clearCompletionNotifications(input: {
  itemId: string;
  actorName: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(personalChecklistNotifications)
    .where(and(
      eq(personalChecklistNotifications.itemId, input.itemId),
      eq(personalChecklistNotifications.actorName, input.actorName),
      eq(personalChecklistNotifications.kind, 'completed'),
    ));
}

/** 비품·시스템 개선 처리 알림만 (전원 확인용) */
export async function listUnreadPersonalChecklistNotifications(
  recipientName: string,
  limit = 20,
): Promise<PersonalChecklistNotificationDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      notification: personalChecklistNotifications,
      taxType: personalChecklistItems.taxType,
    })
    .from(personalChecklistNotifications)
    .innerJoin(
      personalChecklistItems,
      eq(personalChecklistItems.id, personalChecklistNotifications.itemId),
    )
    .where(and(
      eq(personalChecklistNotifications.recipientName, recipientName),
      isNull(personalChecklistNotifications.readAt),
      eq(personalChecklistNotifications.kind, 'completed'),
      inArray(personalChecklistItems.taxType, ['supplies', 'improvement']),
    ))
    .orderBy(desc(personalChecklistNotifications.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // 체크 해제된 알림은 조회 시 제거 (잔여 알림 방지)
  const itemIds = [...new Set(rows.map(r => r.notification.itemId))];
  const checkRows = await db
    .select()
    .from(personalChecklistCheckoffs)
    .where(inArray(personalChecklistCheckoffs.itemId, itemIds));

  const stillDone = new Set(
    checkRows
      .filter(r => r.completed)
      .map(r => `${r.itemId}\0${r.memberName}`),
  );

  const staleIds: string[] = [];
  const alive = [];
  for (const row of rows) {
    const r = row.notification;
    if (stillDone.has(`${r.itemId}\0${r.actorName}`)) {
      alive.push(r);
    } else {
      staleIds.push(r.id);
    }
  }

  if (staleIds.length > 0) {
    await db
      .delete(personalChecklistNotifications)
      .where(inArray(personalChecklistNotifications.id, staleIds));
  }

  return alive.map(r => ({
    id: r.id,
    itemId: r.itemId,
    actorName: r.actorName,
    kind: r.kind,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function markPersonalChecklistNotificationsRead(
  recipientName: string,
  ids?: string[],
): Promise<number> {
  const db = getDb();
  const now = new Date();
  if (ids && ids.length > 0) {
    let updated = 0;
    for (const id of ids) {
      const rows = await db
        .update(personalChecklistNotifications)
        .set({ readAt: now })
        .where(and(
          eq(personalChecklistNotifications.id, id),
          eq(personalChecklistNotifications.recipientName, recipientName),
          isNull(personalChecklistNotifications.readAt),
        ))
        .returning({ id: personalChecklistNotifications.id });
      updated += rows.length;
    }
    return updated;
  }

  const rows = await db
    .update(personalChecklistNotifications)
    .set({ readAt: now })
    .where(and(
      eq(personalChecklistNotifications.recipientName, recipientName),
      isNull(personalChecklistNotifications.readAt),
    ))
    .returning({ id: personalChecklistNotifications.id });
  return rows.length;
}

/** 특정 항목에 대한 내 미확인 알림만 읽음 처리 (확인 버튼) */
export async function markItemNotificationsRead(
  recipientName: string,
  itemId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(personalChecklistNotifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(personalChecklistNotifications.recipientName, recipientName),
      eq(personalChecklistNotifications.itemId, itemId),
      isNull(personalChecklistNotifications.readAt),
    ))
    .returning({ id: personalChecklistNotifications.id });
  return rows.length;
}
