'use client';

import type { CalendarEventDto } from '@/app/types/calendar';
import { resolveEventChipColor } from '@/lib/calendarManagerColors';

function displayTitle(event: CalendarEventDto, currentUser?: string): string {
  if (event.kind === 'personal' && event.ownerName && currentUser && event.ownerName !== currentUser) {
    return `[${event.ownerName}] ${event.title}`;
  }
  return event.title;
}

export function eventDisplayTitle(event: CalendarEventDto, currentUser?: string): string {
  return displayTitle(event, currentUser);
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
  const color = resolveEventChipColor(event, members);
  const label = displayTitle(event, currentUser);
  const inner = (
    <span
      className={`block truncate rounded-md font-semibold text-white shadow-sm ring-1 ring-black/10 ${color} ${
        compact ? 'px-1.5 py-0.5 text-[11px] leading-snug' : 'px-2.5 py-1 text-sm leading-snug'
      }`}
      title={label}
    >
      {label}
    </span>
  );

  if (event.href) {
    return (
      <a href={event.href} className="block hover:brightness-95">
        {inner}
      </a>
    );
  }
  return inner;
}
