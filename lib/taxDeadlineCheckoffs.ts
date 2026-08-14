import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { taxDeadlineCheckoffs } from '@/db/schema';
import type { CheckoffDetail } from '@/app/types/calendar';

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
    existing[row.memberName] = {
      completed: row.completed,
      completedAt: toIso(row.completedAt),
    };
    map.set(row.deadlineId, existing);
  }
  return map;
}

export async function setTaxDeadlineCheckoff(
  deadlineId: string,
  memberName: string,
  completed: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .insert(taxDeadlineCheckoffs)
    .values({
      deadlineId,
      memberName,
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
}

export async function setTaxDeadlineCheckoffs(
  deadlineIds: string[],
  memberName: string,
  completed: boolean,
): Promise<void> {
  const name = memberName.trim();
  if (!name || deadlineIds.length === 0) return;
  await Promise.all(deadlineIds.map(id => setTaxDeadlineCheckoff(id, name, completed)));
}

export async function countUserCompletedTaxDeadlineCheckoffs(
  memberName: string,
  deadlineIds: string[],
): Promise<number> {
  if (deadlineIds.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({ deadlineId: taxDeadlineCheckoffs.deadlineId })
    .from(taxDeadlineCheckoffs)
    .where(and(
      inArray(taxDeadlineCheckoffs.deadlineId, deadlineIds),
      eq(taxDeadlineCheckoffs.memberName, memberName),
      eq(taxDeadlineCheckoffs.completed, true),
    ));
  return rows.length;
}

export function isTaxDeadlineEventId(id: string): boolean {
  return id.startsWith('tax-');
}
