import type { CalendarEventDto } from '@/app/types/calendar';
import { listCompanyEvents } from '@/lib/companyEvents';
import {
  checkoffsFromDetails,
  listCheckoffDetailsForEvents,
} from '@/lib/companyEventCheckoffs';
import { listPersonalChecklistInRange } from '@/lib/personalChecklist';
import { listTaxDeadlines, taxDeadlinesToCalendarEvents } from '@/lib/taxDeadlineCalendar';
import { listCheckoffDetailsForTaxDeadlines } from '@/lib/taxDeadlineCheckoffs';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';

export async function listCalendarEvents(
  ownerNames: string[],
  from: string,
  to: string,
  opts?: { viewerName?: string; includeCheckoffDetails?: boolean },
): Promise<CalendarEventDto[]> {
  const events: CalendarEventDto[] = [];
  const names = ownerNames.map(n => n.trim()).filter(Boolean);
  const viewer = (opts?.viewerName || '').trim();

  const [personal, company, team] = await Promise.all([
    listPersonalChecklistInRange(names, from, to),
    listCompanyEvents({ from, to }),
    listCalendarTeamMembers(),
  ]);

  const taxEvents = taxDeadlinesToCalendarEvents(listTaxDeadlines(from, to));
  const [companyDetails, taxDetails] = await Promise.all([
    listCheckoffDetailsForEvents(company.map(ev => ev.id)),
    listCheckoffDetailsForTaxDeadlines(taxEvents.map(ev => ev.id)),
  ]);

  for (const item of personal) {
    if (!item.dueDate) continue;
    if (item.taxType === 'supplies' || item.taxType === 'improvement') continue;
    events.push({
      id: `personal-${item.id}`,
      kind: 'personal',
      title: item.title,
      startDate: item.dueDate,
      endDate: item.dueDate,
      allDay: true,
      href: `/calendar?highlight=${item.id}`,
      subtitle: item.clientName,
      ownerName: item.ownerName,
      createdAt: item.createdAt,
      completed: !!item.completed,
    });
  }

  for (const ev of company) {
    const details = companyDetails.get(ev.id) ?? {};
    const checkoffs = checkoffsFromDetails(details);
    const myDone = viewer ? !!checkoffs[viewer] : false;
    const kindLabel = ev.scheduleKind === 'deadline' ? '기한' : '범위';
    events.push({
      id: `company-${ev.id}`,
      kind: 'company',
      title: ev.title,
      startDate: ev.startDate,
      endDate: ev.endDate,
      allDay: ev.allDay,
      subtitle: ev.description?.trim() || kindLabel,
      ownerName: ev.createdBy || undefined,
      createdAt: ev.createdAt,
      companyScheduleKind: ev.scheduleKind,
      companyDescription: ev.description,
      completed: myDone,
      checkoffDone: team.filter(n => checkoffs[n]).length,
      checkoffTotal: team.length,
      checkoffDetails: opts?.includeCheckoffDetails ? details : undefined,
    });
  }

  for (const ev of taxEvents) {
    const details = taxDetails.get(ev.id) ?? {};
    const checkoffs = checkoffsFromDetails(details);
    const myDone = viewer ? !!checkoffs[viewer] : false;
    events.push({
      ...ev,
      completed: myDone,
      checkoffDone: team.filter(n => checkoffs[n]).length,
      checkoffTotal: team.length,
      checkoffDetails: opts?.includeCheckoffDetails ? details : undefined,
    });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
