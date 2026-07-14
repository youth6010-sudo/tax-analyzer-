import type { CalendarEventDto } from '@/app/types/calendar';
import { listCompanyEvents } from '@/lib/companyEvents';
import { listCheckoffsForEvents } from '@/lib/companyEventCheckoffs';
import { listPersonalChecklistInRange } from '@/lib/personalChecklist';

export async function listCalendarEvents(
  ownerNames: string[],
  from: string,
  to: string,
  opts?: { viewerName?: string },
): Promise<CalendarEventDto[]> {
  const events: CalendarEventDto[] = [];
  const names = ownerNames.map(n => n.trim()).filter(Boolean);
  const viewer = (opts?.viewerName || '').trim();

  const [personal, company] = await Promise.all([
    listPersonalChecklistInRange(names, from, to),
    listCompanyEvents({ from, to }),
  ]);

  for (const item of personal) {
    if (!item.dueDate) continue;
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

  const companyIds = company.map(ev => ev.id);
  const checkoffMap = await listCheckoffsForEvents(companyIds);

  for (const ev of company) {
    const kindLabel = ev.scheduleKind === 'deadline' ? '기한' : '범위';
    const checkoffs = checkoffMap.get(ev.id) ?? {};
    const myDone = viewer ? !!checkoffs[viewer] : false;
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
    });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
