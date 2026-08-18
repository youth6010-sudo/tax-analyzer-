import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistCheckoffs, personalChecklistItems, personalChecklistNotifications } from '@/db/schema';
import type { PersonalChecklistNotificationDto } from '@/app/types/calendar';
import { getManagerMatchNames } from '@/app/utils/managerMatch';

export type { PersonalChecklistNotificationDto };

export async function createCompletionNotification(input: {
  itemId: string;
  recipientName: string;
  actorName: string;
  title: string;
}): Promise<void> {
  if (!input.recipientName || input.recipientName === input.actorName) return;
  // 실명·닉네임이 같아도 중복 알림 방지
  if (getManagerMatchNames(input.recipientName).includes(input.actorName.trim())) return;
  if (getManagerMatchNames(input.actorName).includes(input.recipientName.trim())) return;

  const db = getDb();
  const recipientAliases = getManagerMatchNames(input.recipientName);
  // 같은 항목·협업자 미확인 알림이 겹치지 않게 정리 후 추가
  await db
    .delete(personalChecklistNotifications)
    .where(and(
      eq(personalChecklistNotifications.itemId, input.itemId),
      eq(personalChecklistNotifications.actorName, input.actorName),
      eq(personalChecklistNotifications.kind, 'completed'),
      inArray(personalChecklistNotifications.recipientName, recipientAliases),
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

/** 협업자 지정 시 초대 알림 (일반 개인 체크리스트) */
export async function createCollaborationInviteNotifications(input: {
  itemId: string;
  ownerName: string;
  assigneeNames: string[];
  title: string;
}): Promise<void> {
  const db = getDb();
  const owner = input.ownerName.trim();
  const title = input.title.trim();
  if (!title) return;

  for (const raw of input.assigneeNames) {
    const name = raw.trim();
    if (!name) continue;
    if (getManagerMatchNames(name).some(a => getManagerMatchNames(owner).includes(a))) continue;

    const recipientAliases = getManagerMatchNames(name);
    const existing = await db
      .select({ id: personalChecklistNotifications.id })
      .from(personalChecklistNotifications)
      .where(and(
        eq(personalChecklistNotifications.itemId, input.itemId),
        eq(personalChecklistNotifications.kind, 'invited'),
        inArray(personalChecklistNotifications.recipientName, recipientAliases),
        isNull(personalChecklistNotifications.readAt),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(personalChecklistNotifications).values({
      itemId: input.itemId,
      recipientName: name,
      actorName: owner,
      kind: 'invited',
      title,
    });
  }
}

/** 협업 초대 알림 — 홈·캘린더 배지용 */
export async function listCollaborationInviteNotifications(
  recipientName: string,
  limit = 40,
): Promise<PersonalChecklistNotificationDto[]> {
  const db = getDb();
  const recipientAliases = getManagerMatchNames(recipientName);
  if (recipientAliases.length === 0) return [];

  const rows = await db
    .select()
    .from(personalChecklistNotifications)
    .where(and(
      inArray(personalChecklistNotifications.recipientName, recipientAliases),
      isNull(personalChecklistNotifications.readAt),
      eq(personalChecklistNotifications.kind, 'invited'),
    ))
    .orderBy(desc(personalChecklistNotifications.createdAt))
    .limit(limit);

  return rows.map(r => ({
    id: r.id,
    itemId: r.itemId,
    actorName: r.actorName,
    kind: r.kind,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** 협업자가 완료를 취소하면 해당 완료 알림 제거 */
export async function clearCompletionNotifications(input: {
  itemId: string;
  actorName: string;
}): Promise<void> {
  const db = getDb();
  const actorAliases = getManagerMatchNames(input.actorName);
  await db
    .delete(personalChecklistNotifications)
    .where(and(
      eq(personalChecklistNotifications.itemId, input.itemId),
      inArray(personalChecklistNotifications.actorName, actorAliases),
      eq(personalChecklistNotifications.kind, 'completed'),
    ));
}

/** 비품·시스템 개선 처리 알림만 (전원 확인용) */
export async function listUnreadPersonalChecklistNotifications(
  recipientName: string,
  limit = 20,
): Promise<PersonalChecklistNotificationDto[]> {
  const db = getDb();
  const recipientAliases = getManagerMatchNames(recipientName);
  if (recipientAliases.length === 0) return [];

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
      inArray(personalChecklistNotifications.recipientName, recipientAliases),
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

  const stillDone = new Set<string>();
  for (const r of checkRows) {
    if (!r.completed) continue;
    stillDone.add(`${r.itemId}\0${r.memberName}`);
    for (const n of getManagerMatchNames(r.memberName)) {
      stillDone.add(`${r.itemId}\0${n}`);
    }
  }

  const staleIds: string[] = [];
  const alive = [];
  for (const row of rows) {
    const r = row.notification;
    const actorAliases = getManagerMatchNames(r.actorName);
    const done = actorAliases.some(a => stillDone.has(`${r.itemId}\0${a}`))
      || stillDone.has(`${r.itemId}\0${r.actorName}`);
    if (done) {
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
  const recipientAliases = getManagerMatchNames(recipientName);
  if (recipientAliases.length === 0) return 0;

  if (ids && ids.length > 0) {
    let updated = 0;
    for (const id of ids) {
      const rows = await db
        .update(personalChecklistNotifications)
        .set({ readAt: now })
        .where(and(
          eq(personalChecklistNotifications.id, id),
          inArray(personalChecklistNotifications.recipientName, recipientAliases),
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
      inArray(personalChecklistNotifications.recipientName, recipientAliases),
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
  const recipientAliases = getManagerMatchNames(recipientName);
  if (recipientAliases.length === 0) return 0;
  const rows = await db
    .update(personalChecklistNotifications)
    .set({ readAt: new Date() })
    .where(and(
      inArray(personalChecklistNotifications.recipientName, recipientAliases),
      eq(personalChecklistNotifications.itemId, itemId),
      isNull(personalChecklistNotifications.readAt),
    ))
    .returning({ id: personalChecklistNotifications.id });
  return rows.length;
}
