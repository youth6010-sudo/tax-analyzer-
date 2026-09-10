import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { taxDeadlineCheckoffs } from '@/db/schema';
import type { CheckoffDetail } from '@/app/types/calendar';
import { putCheckoffDetailWithAliases } from '@/app/utils/checkoffAliases';
import { getManagerMatchNames, resolveCanonicalMemberName } from '@/app/utils/managerMatch';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';

export type TaxDeadlineCheckoffDetailMap = Record<string, CheckoffDetail>;

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

export async function listCheckoffDetailsForTaxDeadlines(
  deadlineIds: string[],
): Promise<Map<string, TaxDeadlineCheckoffDetailMap>> {
  const map = new Map<string, TaxDeadlineCheckoffDetailMap>();
  if (deadlineIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select()
    .from(taxDeadlineCheckoffs)
    .where(inArray(taxDeadlineCheckoffs.deadlineId, deadlineIds));

  for (const row of rows) {
    const existing = map.get(row.deadlineId) ?? {};
    putCheckoffDetailWithAliases(existing, row.memberName, {
      completed: row.completed,
      completedAt: toIso(row.completedAt),
    });
    map.set(row.deadlineId, existing);
  }
  return map;
}

export async function setTaxDeadlineCheckoff(
  deadlineId: string,
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
    .insert(taxDeadlineCheckoffs)
    .values({
      deadlineId,
      memberName: key,
      completed,
      completedAt: completed ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [taxDeadlineCheckoffs.deadlineId, taxDeadlineCheckoffs.memberName],
      set: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });

  const aliases = getManagerMatchNames(key).filter(a => a !== key);
  if (aliases.length === 0) return;
  await db
    .update(taxDeadlineCheckoffs)
    .set({
      completed,
      completedAt: completed ? new Date() : null,
    })
    .where(
      and(
        eq(taxDeadlineCheckoffs.deadlineId, deadlineId),
        inArray(taxDeadlineCheckoffs.memberName, aliases),
      ),
    );
}

export async function setTaxDeadlineCheckoffs(
  deadlineIds: string[],
  memberName: string,
  completed: boolean,
): Promise<void> {
  const name = memberName.trim();
  if (!name || deadlineIds.length === 0) return;
  const team = await listCalendarTeamMembers();
  await Promise.all(
    deadlineIds.map(id => setTaxDeadlineCheckoff(id, name, completed, team)),
  );
}

export async function countUserCompletedTaxDeadlineCheckoffs(
  memberName: string,
  deadlineIds: string[],
): Promise<number> {
  if (deadlineIds.length === 0) return 0;
  const aliases = getManagerMatchNames(memberName);
  if (aliases.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({ deadlineId: taxDeadlineCheckoffs.deadlineId })
    .from(taxDeadlineCheckoffs)
    .where(and(
      inArray(taxDeadlineCheckoffs.deadlineId, deadlineIds),
      inArray(taxDeadlineCheckoffs.memberName, aliases),
      eq(taxDeadlineCheckoffs.completed, true),
    ));
  return new Set(rows.map(r => r.deadlineId)).size;
}

export function isTaxDeadlineEventId(id: string): boolean {
  return id.startsWith('tax-');
}
