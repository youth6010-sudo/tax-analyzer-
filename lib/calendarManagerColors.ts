import type { CalendarEventDto } from '@/app/types/calendar';

/** 사내 일정 — 남색 채움 */
export const COMPANY_CHIP_COLOR = 'bg-[#1e3a8a]';

/** 세무신고일정 — 배경 없음 · 남색 테두리 */
export const TAX_DEADLINE_NAVY = '#1e3a8a';
export const TAX_DEADLINE_CHIP_COLOR =
  'border border-[#1e3a8a] bg-transparent text-[#1e3a8a] shadow-none ring-0';

/** 휴가 — 민트 테두리 */
export const LEAVE_CHIP_COLOR =
  'border border-teal-600 bg-teal-50 text-teal-900 shadow-none ring-0';

/** 담당자 고정 색 (팀 닉네임 기준) — `app/globals.css` `.cal-mgr-*` */
export const MANAGER_COLOR_BY_NAME: Record<string, string> = {
  다야: 'cal-mgr-daya',
  블루: 'cal-mgr-blue',
  리아: 'cal-mgr-ria',
  윈터: 'cal-mgr-winter',
  인디: 'bg-slate-500',
  찰리: 'cal-mgr-charlie',
  페리: 'cal-mgr-perry',
};

/** 담당자 accent 보더·dot용 hex (캘린더 칩과 동일) */
export const MANAGER_HEX_BY_NAME: Record<string, string> = {
  다야: '#ffe64d',
  블루: '#9dcce8',
  리아: '#c9b8e8',
  윈터: '#e87898',
  인디: '#64748b',
  찰리: '#dc2626',
  페리: '#22a55a',
};

const DEFAULT_MANAGER_HEX = '#cbd5e1';

export function managerHexColor(name: string): string {
  return MANAGER_HEX_BY_NAME[name.trim()] ?? DEFAULT_MANAGER_HEX;
}

export function managerAccentBorderStyle(name: string): { borderLeftColor: string } {
  return { borderLeftColor: managerHexColor(name) };
}

/** 파스텔·밝은 칩 — 진한 글자 */
const LIGHT_MANAGER_CHIP_COLORS = new Set([
  MANAGER_COLOR_BY_NAME.다야,
  MANAGER_COLOR_BY_NAME.블루,
  MANAGER_COLOR_BY_NAME.리아,
  MANAGER_COLOR_BY_NAME.윈터,
]);

export function isLightManagerChipColor(color: string): boolean {
  return LIGHT_MANAGER_CHIP_COLORS.has(color);
}

/** 범례·필터 표시 순서 */
export const MANAGER_LEGEND_ORDER = ['다야', '블루', '리아', '윈터', '인디', '찰리', '페리'] as const;

/** 미등록 담당자 fallback */
const FALLBACK_MANAGER_COLORS = [
  'bg-orange-600',
  'bg-teal-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-cyan-700',
  'bg-lime-700',
] as const;

const KIND_CHIP_COLORS: Record<CalendarEventDto['kind'], string> = {
  personal: MANAGER_COLOR_BY_NAME.다야,
  company: COMPANY_CHIP_COLOR,
  tax_deadline: TAX_DEADLINE_CHIP_COLOR,
  client_task: 'bg-rose-600',
  leave: LEAVE_CHIP_COLOR,
  duty: MANAGER_COLOR_BY_NAME.다야,
};

export function isTaxDeadlineChipColor(color: string): boolean {
  return color === TAX_DEADLINE_CHIP_COLOR;
}

export function isLeaveChipColor(color: string): boolean {
  return color === LEAVE_CHIP_COLOR;
}

export function managerChipColor(ownerName: string, members: readonly string[]): string {
  const name = ownerName.trim();
  const fixed = MANAGER_COLOR_BY_NAME[name];
  if (fixed) return fixed;

  const idx = members.indexOf(name);
  if (idx >= 0) return FALLBACK_MANAGER_COLORS[idx % FALLBACK_MANAGER_COLORS.length];
  return 'bg-slate-600';
}

export function resolveEventChipColor(
  event: CalendarEventDto,
  members: readonly string[],
): string {
  if (event.kind === 'company') return COMPANY_CHIP_COLOR;
  if (event.kind === 'leave') return LEAVE_CHIP_COLOR;
  if (event.kind === 'tax_deadline') return TAX_DEADLINE_CHIP_COLOR;
  if ((event.kind === 'personal' || event.kind === 'duty') && event.ownerName) {
    return managerChipColor(event.ownerName, members);
  }
  return KIND_CHIP_COLORS[event.kind];
}

function sortOwnersForLegend(owners: string[], members: string[]): string[] {
  return [...owners].sort((a, b) => {
    const ia = MANAGER_LEGEND_ORDER.indexOf(a as (typeof MANAGER_LEGEND_ORDER)[number]);
    const ib = MANAGER_LEGEND_ORDER.indexOf(b as (typeof MANAGER_LEGEND_ORDER)[number]);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return members.indexOf(a) - members.indexOf(b);
  });
}

export function buildCalendarLegend(
  members: string[],
  selectedOwners: string[],
): { key: string; label: string; color: string }[] {
  const legend: { key: string; label: string; color: string }[] = [
    { key: 'company', label: '사내', color: COMPANY_CHIP_COLOR },
    { key: 'tax_deadline', label: '세무신고', color: TAX_DEADLINE_CHIP_COLOR },
    { key: 'leave', label: '휴가', color: LEAVE_CHIP_COLOR },
  ];

  const owners =
    selectedOwners.length > 0
      ? members.filter(name => selectedOwners.includes(name))
      : members;

  for (const name of sortOwnersForLegend(owners, members)) {
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

/** @deprecated 이름 고정 색 사용 — 하위 호환 */
export const MANAGER_CHIP_COLORS = Object.values(MANAGER_COLOR_BY_NAME);
