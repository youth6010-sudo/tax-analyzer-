import type { CalendarEventDto, CompanyEventDto } from '@/app/types/calendar';

export function calendarEventRecordId(event: CalendarEventDto): string | null {
  if (event.kind === 'personal' && event.id.startsWith('personal-')) {
    return event.id.slice('personal-'.length);
  }
  if (event.kind === 'company' && event.id.startsWith('company-')) {
    return event.id.slice('company-'.length);
  }
  return null;
}

export function canDeleteCalendarEvent(
  event: CalendarEventDto,
  currentUser: string,
  isAdmin: boolean,
): boolean {
  if (!currentUser) return false;
  if (event.kind === 'personal') return event.ownerName === currentUser;
  if (event.kind === 'company') return isAdmin || event.ownerName === currentUser;
  return false;
}

export async function deleteCalendarEvent(
  event: CalendarEventDto,
  opts?: { series?: boolean },
): Promise<void> {
  const id = calendarEventRecordId(event);
  if (!id) throw new Error('삭제할 수 없는 일정입니다.');

  const url =
    event.kind === 'personal'
      ? `/api/calendar/personal-checklist/${id}${opts?.series ? '?scope=series' : ''}`
      : `/api/calendar/company-events?id=${encodeURIComponent(id)}`;

  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || '삭제 실패');
  }
}

export function companyEventFromCalendar(event: CalendarEventDto): CompanyEventDto | null {
  if (event.kind !== 'company') return null;
  const id = calendarEventRecordId(event);
  if (!id) return null;
  return {
    id,
    title: event.title,
    description: event.companyDescription ?? '',
    startDate: event.startDate,
    endDate: event.endDate,
    scheduleKind: event.companyScheduleKind ?? 'range',
    allDay: event.allDay,
    createdBy: event.ownerName ?? '',
    createdAt: event.createdAt ?? '',
    updatedAt: event.createdAt ?? '',
  };
}
