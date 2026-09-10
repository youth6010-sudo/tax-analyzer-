import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { companyEventCheckoffs } from '@/db/schema';
import type { CheckoffDetail } from '@/app/types/calendar';
import { putCheckoffDetailWithAliases } from '@/app/utils/checkoffAliases';
import { getManagerMatchNames, resolveCanonicalMemberName } from '@/app/utils/managerMatch';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';

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
    putCheckoffDetailWithAliases(existing, row.memberName, {
      completed: row.completed,
      completedAt: toIso(row.completedAt),
    });
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
  canonicalParticipants?: readonly string[],
): Promise<void> {
  const db = getDb();
  const team = canonicalParticipants?.length
    ? canonicalParticipants
    : await listCalendarTeamMembers();
  const key = resolveCanonicalMemberName(memberName, team);

  await db
    .insert(companyEventCheckoffs)
    .values({
      eventId,
      memberName: key,
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

  // 예전 실명/닉네임 중복 행이 있으면 동일 상태로 맞춤
  const aliases = getManagerMatchNames(key).filter(a => a !== key);
  if (aliases.length === 0) return;
  await db
    .update(companyEventCheckoffs)
    .set({
      completed,
      completedAt: completed ? new Date() : null,
    })
    .where(
      and(
        eq(companyEventCheckoffs.eventId, eventId),
        inArray(companyEventCheckoffs.memberName, aliases),
      ),
    );
}

export async function countUserCompletedCheckoffs(
  memberName: string,
  eventIds: string[],
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const aliases = getManagerMatchNames(memberName);
  if (aliases.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({ eventId: companyEventCheckoffs.eventId })
    .from(companyEventCheckoffs)
    .where(and(
      inArray(companyEventCheckoffs.eventId, eventIds),
      inArray(companyEventCheckoffs.memberName, aliases),
      eq(companyEventCheckoffs.completed, true),
    ));
  return new Set(rows.map(r => r.eventId)).size;
}
