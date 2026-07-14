import { and, asc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { companyEvents } from '@/db/schema';
import type { CompanyEventDto, CompanyScheduleKind } from '@/app/types/calendar';
import { isPortalAdmin } from '@/lib/masterAccess';
import { currentMonthRange } from '@/lib/calendarMonth';

function toDto(row: typeof companyEvents.$inferSelect): CompanyEventDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    scheduleKind: (row.scheduleKind === 'deadline' ? 'deadline' : 'range') as CompanyScheduleKind,
    allDay: row.allDay,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCompanyEvents(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<CompanyEventDto[]> {
  const db = getDb();
  const conditions = [];

  if (opts?.from && opts?.to) {
    conditions.push(or(
      and(gte(companyEvents.startDate, opts.from), lte(companyEvents.startDate, opts.to)),
      and(lte(companyEvents.startDate, opts.to), gte(companyEvents.endDate, opts.from)),
    ));
  } else if (opts?.to) {
    conditions.push(lte(companyEvents.startDate, opts.to));
  }

  const rows = await db
    .select()
    .from(companyEvents)
    .where(conditions.length ? and(...conditions) : sql`true`)
    .orderBy(asc(companyEvents.startDate))
    .limit(opts?.limit ?? 200);

  return rows.map(toDto);
}

export async function listUpcomingCompanyEvents(limit = 20): Promise<CompanyEventDto[]> {
  const { from, to } = currentMonthRange();
  return listCompanyEvents({ from, to, limit });
}

export type CreateCompanyEventInput = {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  scheduleKind?: CompanyScheduleKind;
  allDay?: boolean;
};

export async function createCompanyEvent(
  createdBy: string,
  input: CreateCompanyEventInput,
): Promise<CompanyEventDto> {
  const [item] = await createCompanyEvents(createdBy, input, [input.startDate.trim()]);
  return item;
}

/** 동일 제목·설명으로 여러 마감일 일괄 등록 */
export async function createCompanyEvents(
  createdBy: string,
  input: Omit<CreateCompanyEventInput, 'startDate' | 'endDate'> & {
    startDate?: string;
    endDate?: string;
  },
  dates: string[],
): Promise<CompanyEventDto[]> {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error('제목을 입력하세요.');

  const uniqueDates = [...new Set(dates.map(d => d.trim()).filter(Boolean))].sort();
  if (uniqueDates.length === 0) throw new Error('마감기한을 지정하세요.');

  const rows = await db
    .insert(companyEvents)
    .values(
      uniqueDates.map(startDate => ({
        title,
        description: input.description?.trim() || '',
        startDate,
        endDate: startDate,
        scheduleKind: 'deadline' as const,
        allDay: input.allDay ?? true,
        createdBy,
      })),
    )
    .returning();

  return rows.map(toDto);
}

export async function updateCompanyEvent(
  id: string,
  userName: string,
  isAdmin: boolean,
  patch: Partial<CreateCompanyEventInput>,
): Promise<CompanyEventDto> {
  const db = getDb();
  const [existing] = await db.select().from(companyEvents).where(eq(companyEvents.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');
  if (!isAdmin && existing.createdBy !== userName) throw new Error('FORBIDDEN');

  const [row] = await db
    .update(companyEvents)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate.trim() } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate.trim() } : {}),
      ...(patch.scheduleKind !== undefined ? { scheduleKind: patch.scheduleKind } : {}),
      ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
      updatedAt: new Date(),
    })
    .where(eq(companyEvents.id, id))
    .returning();

  return toDto(row);
}

export async function deleteCompanyEvent(
  id: string,
  userName: string,
  isAdmin: boolean,
): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(companyEvents).where(eq(companyEvents.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');
  if (!isAdmin && existing.createdBy !== userName) throw new Error('FORBIDDEN');
  await db.delete(companyEvents).where(eq(companyEvents.id, id));
}

export async function deleteAllCompanyEvents(): Promise<number> {
  const db = getDb();
  const rows = await db.delete(companyEvents).returning({ id: companyEvents.id });
  return rows.length;
}

export function canEditCompanyEvent(
  event: CompanyEventDto,
  userName: string,
  isAdmin: boolean,
): boolean {
  return isAdmin || event.createdBy === userName;
}
