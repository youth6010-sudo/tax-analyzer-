import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { dutyWeeks } from '@/db/schema';

export type DutyWeekDto = {
  id: string;
  memberName: string;
  weekStart: string;
  weekEnd: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DutyMonthSlot = {
  weekStart: string;
  weekEnd: string;
  memberName: string;
  id: string | null;
};

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 해당 날짜가 속한 주의 월요일 */
export function mondayOf(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) throw new Error('날짜 형식이 올바르지 않습니다.');
  const day = d.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatIso(d);
}

export function fridayOfMonday(weekStart: string): string {
  const d = parseIsoDate(weekStart);
  if (!d) throw new Error('날짜 형식이 올바르지 않습니다.');
  d.setDate(d.getDate() + 4);
  return formatIso(d);
}

/** 해당 월과 겹치는 월~금 주차 목록 (월요일 기준 오름차순) */
export function weeksOverlappingMonth(year: number, month: number): { weekStart: string; weekEnd: string }[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('연·월이 올바르지 않습니다.');
  }
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let cursor = mondayOf(monthStart);
  // 월요일이 전달이면 그래도 포함 (그 주 금요일이 이번 달과 겹칠 수 있음)
  const first = parseIsoDate(cursor)!;
  const firstFri = fridayOfMonday(cursor);
  if (firstFri < monthStart) {
    first.setDate(first.getDate() + 7);
    cursor = formatIso(first);
  }

  const out: { weekStart: string; weekEnd: string }[] = [];
  while (cursor <= monthEnd) {
    const weekEnd = fridayOfMonday(cursor);
    if (weekEnd >= monthStart && cursor <= monthEnd) {
      out.push({ weekStart: cursor, weekEnd });
    }
    const next = parseIsoDate(cursor)!;
    next.setDate(next.getDate() + 7);
    cursor = formatIso(next);
  }
  return out;
}

function toDto(row: typeof dutyWeeks.$inferSelect): DutyWeekDto {
  return {
    id: row.id,
    memberName: row.memberName,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDutyWeeksInRange(
  from: string,
  to: string,
  memberNames?: string[],
): Promise<DutyWeekDto[]> {
  const db = getDb();
  const conditions = [lte(dutyWeeks.weekStart, to), gte(dutyWeeks.weekEnd, from)];
  const names = (memberNames || []).map(n => n.trim()).filter(Boolean);
  if (names.length > 0) {
    conditions.push(inArray(dutyWeeks.memberName, names));
  }
  const rows = await db
    .select()
    .from(dutyWeeks)
    .where(and(...conditions))
    .orderBy(asc(dutyWeeks.weekStart));
  return rows.map(toDto);
}

export async function listDutyMonthSlots(year: number, month: number): Promise<DutyMonthSlot[]> {
  const weeks = weeksOverlappingMonth(year, month);
  if (weeks.length === 0) return [];
  const from = weeks[0].weekStart;
  const to = weeks[weeks.length - 1].weekEnd;
  const existing = await listDutyWeeksInRange(from, to);
  const byStart = new Map(existing.map(r => [r.weekStart, r]));
  return weeks.map(w => {
    const row = byStart.get(w.weekStart);
    return {
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      memberName: row?.memberName ?? '',
      id: row?.id ?? null,
    };
  });
}

/** 월별 주차 일괄 반영 — memberName 빈 값이면 해당 주 삭제 */
export async function upsertDutyMonth(
  actorName: string,
  year: number,
  month: number,
  weeks: { weekStart: string; memberName: string | null }[],
): Promise<DutyMonthSlot[]> {
  const allowed = new Set(weeksOverlappingMonth(year, month).map(w => w.weekStart));
  const db = getDb();

  for (const item of weeks) {
    const weekStart = item.weekStart.trim();
    if (!allowed.has(weekStart)) {
      throw new Error(`해당 월에 속하지 않는 주차입니다: ${weekStart}`);
    }
    const weekEnd = fridayOfMonday(weekStart);
    const memberName = (item.memberName || '').trim();

    if (!memberName) {
      await db.delete(dutyWeeks).where(eq(dutyWeeks.weekStart, weekStart));
      continue;
    }

    const [existing] = await db
      .select()
      .from(dutyWeeks)
      .where(eq(dutyWeeks.weekStart, weekStart))
      .limit(1);

    if (existing) {
      await db
        .update(dutyWeeks)
        .set({
          memberName,
          weekEnd,
          updatedAt: new Date(),
        })
        .where(eq(dutyWeeks.id, existing.id));
    } else {
      await db.insert(dutyWeeks).values({
        memberName,
        weekStart,
        weekEnd,
        createdBy: actorName,
      });
    }
  }

  return listDutyMonthSlots(year, month);
}
