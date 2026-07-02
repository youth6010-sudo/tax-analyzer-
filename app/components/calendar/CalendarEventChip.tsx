'use client';

import type { CalendarEventDto } from '@/app/types/calendar';

const KIND_COLORS: Record<CalendarEventDto['kind'], string> = {
  personal: 'bg-amber-500',
  company: 'bg-sky-500',
  tax_deadline: 'bg-emerald-500',
  client_task: 'bg-rose-500',
};

function displayTitle(event: CalendarEventDto, currentUser?: string): string {
  if (event.kind === 'personal' && event.ownerName && currentUser && event.ownerName !== currentUser) {
    return `[${event.ownerName}] ${event.title}`;
  }
  return event.title;
}

export default function CalendarEventChip({
  event,
  compact,
  currentUser,
}: {
  event: CalendarEventDto;
  compact?: boolean;
  currentUser?: string;
}) {
  const color = KIND_COLORS[event.kind];
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

export function kindLegend() {
  return [
    { kind: 'personal' as const, label: '개인', color: 'bg-amber-500' },
    { kind: 'company' as const, label: '사내', color: 'bg-sky-500' },
  ];
}
