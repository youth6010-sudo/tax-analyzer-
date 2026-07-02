'use client';

import type { MouseEvent } from 'react';
import type { CalendarEventDto } from '@/app/types/calendar';import { resolveEventChipColor, isLightManagerChipColor } from '@/lib/calendarManagerColors';

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
  onDoubleClick,
}: {
  event: CalendarEventDto;
  compact?: boolean;
  currentUser?: string;
  members?: readonly string[];
  onDoubleClick?: (event: CalendarEventDto) => void;
}) {
  const color = resolveEventChipColor(event, members);
  const label = displayTitle(event, currentUser);
  const lightText = isLightManagerChipColor(color);
  const canEdit = event.kind === 'personal' && Boolean(onDoubleClick);

  const handleDoubleClick = (e: MouseEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    onDoubleClick?.(event);
  };

  const handleClick = (e: MouseEvent) => {
    if (canEdit) e.stopPropagation();
  };

  const inner = (
    <span
      className={`block truncate rounded-md font-semibold shadow-sm ring-1 ring-black/10 ${color} ${
        lightText ? 'text-slate-900' : 'text-white'
      } ${compact ? 'px-1.5 py-0.5 text-[11px] leading-snug' : 'px-2.5 py-1 text-sm leading-snug'} ${
        canEdit ? 'cursor-pointer' : ''
      }`}
      title={canEdit ? `${label} (더블클릭: 수정)` : label}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    >
      {label}
    </span>
  );

  if (event.href && !canEdit) {
    return (
      <a href={event.href} className="block hover:brightness-95">
        {inner}
      </a>
    );
  }
  return inner;
}
