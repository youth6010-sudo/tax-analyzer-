/** 개인 일정 칩 — 담당자별 고정 팔레트 (Tailwind 완성형 클래스) */
export const MANAGER_CHIP_COLORS = [
  'bg-amber-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-fuchsia-500',
  'bg-lime-600',
  'bg-cyan-600',
] as const;

export const COMPANY_CHIP_COLOR = 'bg-sky-500';

export function managerChipColor(ownerName: string, members: readonly string[]): string {
  const idx = members.indexOf(ownerName);
  if (idx < 0) return MANAGER_CHIP_COLORS[0];
  return MANAGER_CHIP_COLORS[idx % MANAGER_CHIP_COLORS.length];
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
