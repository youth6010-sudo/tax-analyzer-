'use client';

import type { CalendarEventDto } from '@/app/types/calendar';
import { COMPANY_CHIP_COLOR, managerChipColor } from '@/lib/calendarManagerColors';

const KIND_COLORS: Record<CalendarEventDto['kind'], string> = {
  personal: 'bg-amber-500',
  company: COMPANY_CHIP_COLOR,
  tax_deadline: 'bg-emerald-500',
  client_task: 'bg-rose-500',
};

function displayTitle(event: CalendarEventDto, currentUser?: string): string {
  if (event.kind === 'personal' && event.ownerName && currentUser && event.ownerName !== currentUser) {
    return `[${event.ownerName}] ${event.title}`;
  }
  return event.title;
}

function resolveChipColor(event: CalendarEventDto, members: readonly string[]): string {
  if (event.kind === 'personal' && event.ownerName && members.length > 0) {
    return managerChipColor(event.ownerName, members);
  }
  return KIND_COLORS[event.kind];
}

export default function CalendarEventChip({
  event,
  compact,
  currentUser,
  members = [],
}: {
  event: CalendarEventDto;
  compact?: boolean;
  currentUser?: string;
  members?: readonly string[];
}) {
  const color = resolveChipColor(event, members);
  const label = displayTitle(event, currentUser);
  const inner = (
    <span
      className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white ${color} ${
        compact ? 'max-w-full' : ''
      }`}
      title={label}
    >
      {label}
    </span>
  );

  if (event.href) {
    return (
      <a href={event.href} className="block hover:opacity-90">
        {inner}
      </a>
    );
  }
  return inner;
}
