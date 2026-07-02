import type { CalendarEventDto } from '@/app/types/calendar';

/** 개인 일정 칩 — 담당자별 고정 팔레트 (흰 글자 대비 600톤) */
export const MANAGER_CHIP_COLORS = [
  'bg-amber-600',
  'bg-violet-600',
  'bg-emerald-600',
  'bg-rose-600',
  'bg-indigo-600',
  'bg-orange-600',
  'bg-teal-600',
  'bg-fuchsia-600',
  'bg-lime-700',
  'bg-cyan-700',
] as const;

export const COMPANY_CHIP_COLOR = 'bg-sky-600';

const KIND_CHIP_COLORS: Record<CalendarEventDto['kind'], string> = {
  personal: 'bg-amber-600',
  company: COMPANY_CHIP_COLOR,
  tax_deadline: 'bg-emerald-600',
  client_task: 'bg-rose-600',
};

export function managerChipColor(ownerName: string, members: readonly string[]): string {
  const idx = members.indexOf(ownerName);
  if (idx < 0) return MANAGER_CHIP_COLORS[0];
  return MANAGER_CHIP_COLORS[idx % MANAGER_CHIP_COLORS.length];
}

export function resolveEventChipColor(
  event: CalendarEventDto,
  members: readonly string[],
): string {
  if (event.kind === 'personal' && event.ownerName && members.length > 0) {
    return managerChipColor(event.ownerName, members);
  }
  return KIND_CHIP_COLORS[event.kind];
}

export function buildCalendarLegend(
  members: string[],
  selectedOwners: string[],
): { key: string; label: string; color: string }[] {
  const legend: { key: string; label: string; color: string }[] = [
    { key: 'company', label: '사내', color: COMPANY_CHIP_COLOR },
  ];

  const owners =
    selectedOwners.length > 0
      ? members.filter(name => selectedOwners.includes(name))
      : members;

  for (const name of owners) {
    legend.push({
      key: `personal-${name}`,
      label: name,
      color: managerChipColor(name, members),
    });
  }

  return legend;
}

export function formatCalendarDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${iso} (${weekdays[d.getDay()]})`;
}
