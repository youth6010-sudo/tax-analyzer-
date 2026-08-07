import type { CalendarEventDto } from '@/app/types/calendar';
import { formatLeaveKindLabel } from '@/app/types/leave';
import { listCompanyEvents } from '@/lib/companyEvents';
import {
  checkoffsFromDetails,
  listCheckoffDetailsForEvents,
} from '@/lib/companyEventCheckoffs';
import { listPersonalChecklistInRange } from '@/lib/personalChecklist';
import { listTaxDeadlines, taxDeadlinesToCalendarEvents } from '@/lib/taxDeadlineCalendar';
import { listCheckoffDetailsForTaxDeadlines } from '@/lib/taxDeadlineCheckoffs';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import { listApprovedLeaveInRange } from '@/lib/leaveDb';
import { listDutyWeeksInRange } from '@/lib/dutyWeeks';

export async function listCalendarEvents(
  ownerNames: string[],
  from: string,
  to: string,
  opts?: { viewerName?: string; includeCheckoffDetails?: boolean },
): Promise<CalendarEventDto[]> {
  const events: CalendarEventDto[] = [];
  const names = ownerNames.map(n => n.trim()).filter(Boolean);
  const viewer = (opts?.viewerName || '').trim();

  // 커넥션 풀(max 3) 고갈 방지 — 병렬 대신 순차 조회
  const personal = await listPersonalChecklistInRange(names, from, to);
  const company = await listCompanyEvents({ from, to });
  const team = await listCalendarTeamMembers();
  let leaves: Awaited<ReturnType<typeof listApprovedLeaveInRange>> = [];
  try {
    leaves = await listApprovedLeaveInRange(names, from, to);
  } catch (err) {
    console.error('listApprovedLeaveInRange failed', err);
  }
  let duties: Awaited<ReturnType<typeof listDutyWeeksInRange>> = [];
  try {
    duties = await listDutyWeeksInRange(from, to, names.length > 0 ? names : undefined);
  } catch (err) {
    console.error('listDutyWeeksInRange failed', err);
  }

  const taxEvents = taxDeadlinesToCalendarEvents(listTaxDeadlines(from, to));
  const companyDetails = await listCheckoffDetailsForEvents(company.map(ev => ev.id));
  const taxDetails = await listCheckoffDetailsForTaxDeadlines(taxEvents.map(ev => ev.id));

  for (const item of personal) {
    if (!item.dueDate) continue;
    if (item.taxType === 'supplies' || item.taxType === 'improvement') continue;
    events.push({
      id: `personal-${item.id}`,
      kind: 'personal',
      title: item.dueTime ? `${item.dueTime} ${item.title}` : item.title,
      startDate: item.dueDate,
      endDate: item.dueDate,
      allDay: !item.dueTime,
      href: `/calendar?highlight=${item.id}`,
      subtitle: item.clientName,
      ownerName: item.ownerName,
      createdAt: item.createdAt,
      completed: !!item.completed,
      repeatSeriesId: item.repeatSeriesId ?? null,
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

  for (const leave of leaves) {
    const kindLabel = formatLeaveKindLabel(leave.leaveKind, leave.halfSlot);
    events.push({
      id: `leave-${leave.id}`,
      kind: 'leave',
      title: kindLabel,
      startDate: leave.startDate,
      endDate: leave.endDate,
      allDay: true,
      href: '/leave',
      subtitle: leave.title,
      ownerName: leave.applicantName,
      createdAt: leave.createdAt,
      leaveHalfSlot: leave.halfSlot || '',
    });
  }

  for (const duty of duties) {
    events.push({
      id: `duty-${duty.id}`,
      kind: 'duty',
      title: '당번',
      startDate: duty.weekStart,
      endDate: duty.weekEnd,
      allDay: true,
      ownerName: duty.memberName,
      createdAt: duty.createdAt,
    });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
