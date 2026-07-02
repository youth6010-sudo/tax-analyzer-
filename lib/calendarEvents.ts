import type { CalendarEventDto } from '@/app/types/calendar';
import { listCompanyEvents } from '@/lib/companyEvents';
import { listPersonalChecklistInRange } from '@/lib/personalChecklist';

export async function listCalendarEvents(
  ownerNames: string[],
  from: string,
  to: string,
): Promise<CalendarEventDto[]> {
  const events: CalendarEventDto[] = [];
  const names = ownerNames.map(n => n.trim()).filter(Boolean);

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
    });
  }

  for (const ev of company) {
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
    });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
