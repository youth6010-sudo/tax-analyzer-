'use client';

import { COMPANY_CHIP_COLOR, managerChipColor, MANAGER_LEGEND_ORDER } from '@/lib/calendarManagerColors';

type Props = {
  members: string[];
  currentUser: string;
  selected: string[];
  onChange: (names: string[]) => void;
  showCompany: boolean;
  onShowCompanyChange: (show: boolean) => void;
};

function sortMembers(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = MANAGER_LEGEND_ORDER.indexOf(a as (typeof MANAGER_LEGEND_ORDER)[number]);
    const ib = MANAGER_LEGEND_ORDER.indexOf(b as (typeof MANAGER_LEGEND_ORDER)[number]);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'ko');
  });
}

export default function CalendarTeamFilter({
  members,
  currentUser,
  selected,
  onChange,
  showCompany,
  onShowCompanyChange,
}: Props) {
  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(n => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const selectAll = () => onChange([...members]);
  const selectMine = () => onChange([currentUser]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-slate-800">업무구분</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectMine}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            나만
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            전체
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2.5">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showCompany}
            onChange={() => onShowCompanyChange(!showCompany)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 ${COMPANY_CHIP_COLOR}`}
            aria-hidden
          />
          <span className="font-medium text-slate-900">사내</span>
        </label>
        {sortMembers(members).map(name => (
          <label
            key={name}
            className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => toggle(name)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 ${managerChipColor(name, members)}`}
              aria-hidden
            />
            <span className={name === currentUser ? 'font-bold text-slate-900' : 'font-medium'}>
              {name}
              {name === currentUser ? ' (나)' : ''}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
