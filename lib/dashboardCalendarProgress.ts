import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistItems } from '@/db/schema';
import { listCompanyEvents } from '@/lib/companyEvents';
import { countUserCompletedCheckoffs } from '@/lib/companyEventCheckoffs';
import { currentMonthRange } from '@/lib/calendarMonth';

export type DashboardCalendarProgress = {
  personalRegistered: number;
  personalCompleted: number;
  companyTotal: number;
  companyCompleted: number;
  monthLabel: string;
};

export async function getDashboardCalendarProgress(
  userName: string,
): Promise<DashboardCalendarProgress> {
  const { from, to, year, month } = currentMonthRange();
  const monthStart = new Date(`${from}T00:00:00`);
  const monthEnd = new Date(`${to}T23:59:59.999`);

  const db = getDb();
  const personalRows = await db
    .select({ completed: personalChecklistItems.completed })
    .from(personalChecklistItems)
    .where(and(
      eq(personalChecklistItems.ownerName, userName),
      gte(personalChecklistItems.createdAt, monthStart),
      lte(personalChecklistItems.createdAt, monthEnd),
    ));

  const companyEvents = await listCompanyEvents({ from, to });
  const companyIds = companyEvents.map(e => e.id);
  const companyCompleted = await countUserCompletedCheckoffs(userName, companyIds);

  return {
    personalRegistered: personalRows.length,
    personalCompleted: personalRows.filter(r => r.completed).length,
    companyTotal: companyEvents.length,
    companyCompleted,
    monthLabel: `${year}년 ${month}월`,
  };
}
