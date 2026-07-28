import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistCheckoffs } from '@/db/schema';
import type { CheckoffDetail } from '@/app/types/calendar';
import { getManagerMatchNames, resolveCanonicalMemberName } from '@/app/utils/managerMatch';

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
    const detail: CheckoffDetail = {
      completed: row.completed,
      completedAt: toIso(row.completedAt),
      dismissedAt: toIso(row.dismissedAt),
    };
    existing[row.memberName] = detail;
    // 닉네임·실명 양쪽에서 조회되도록 별칭 키도 채움
    for (const alias of getManagerMatchNames(row.memberName)) {
      if (!existing[alias]) existing[alias] = detail;
    }
    map.set(row.itemId, existing);
  }
  return map;
}

export async function setPersonalChecklistCheckoff(
  itemId: string,
  memberName: string,
  completed: boolean,
  canonicalParticipants?: readonly string[],
): Promise<void> {
  const db = getDb();
  const key = canonicalParticipants?.length
    ? resolveCanonicalMemberName(memberName, canonicalParticipants)
    : memberName.trim();

  await db
    .insert(personalChecklistCheckoffs)
    .values({
      itemId,
      memberName: key,
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
    await clearCompletionNotifications({ itemId, actorName: key });
  }
}

/** 협업자 본인만 — 처리완료 후 내 목록에서 숨김 (다른 사람 목록에 영향 없음) */
export async function dismissPersonalChecklistCheckoff(
  itemId: string,
  memberName: string,
  canonicalParticipants?: readonly string[],
): Promise<void> {
  const db = getDb();
  const aliases = [
    ...new Set([
      ...getManagerMatchNames(memberName),
      ...(canonicalParticipants?.length
        ? [resolveCanonicalMemberName(memberName, canonicalParticipants)]
        : []),
    ]),
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(personalChecklistCheckoffs)
    .where(and(
      eq(personalChecklistCheckoffs.itemId, itemId),
      inArray(personalChecklistCheckoffs.memberName, aliases),
    ));

  const completedRow = rows.find(r => r.completed);
  if (!completedRow) {
    throw new Error('처리완료 후에만 확인할 수 있습니다.');
  }

  const now = new Date();
  await db
    .update(personalChecklistCheckoffs)
    .set({ dismissedAt: now })
    .where(and(
      eq(personalChecklistCheckoffs.itemId, itemId),
      inArray(
        personalChecklistCheckoffs.memberName,
        rows.filter(r => r.completed).map(r => r.memberName),
      ),
    ));
}

export async function countCompletedAmongMembers(
  itemId: string,
  memberNames: string[],
): Promise<number> {
  if (memberNames.length === 0) return 0;
  const db = getDb();
  const aliases = [...new Set(memberNames.flatMap(n => getManagerMatchNames(n)))];
  const rows = await db
    .select({ memberName: personalChecklistCheckoffs.memberName })
    .from(personalChecklistCheckoffs)
    .where(and(
      eq(personalChecklistCheckoffs.itemId, itemId),
      inArray(personalChecklistCheckoffs.memberName, aliases),
      eq(personalChecklistCheckoffs.completed, true),
    ));

  let count = 0;
  for (const m of memberNames) {
    if (rows.some(r => resolveCanonicalMemberName(r.memberName, memberNames) === m
      || getManagerMatchNames(r.memberName).includes(m)
      || getManagerMatchNames(m).includes(r.memberName))) {
      count += 1;
    }
  }
  return count;
}
