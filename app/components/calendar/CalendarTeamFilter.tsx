'use client';

import { managerChipColor } from '@/lib/calendarManagerColors';

type Props = {
  members: string[];
  currentUser: string;
  selected: string[];
  onChange: (names: string[]) => void;
};

export default function CalendarTeamFilter({
  members,
  currentUser,
  selected,
  onChange,
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
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-slate-700">담당자 일정 표시</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectMine}
            className="text-[11px] font-semibold text-blue-600 hover:underline"
          >
            나만
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] font-semibold text-blue-600 hover:underline"
          >
            전체
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {members.map(name => (
          <label
            key={name}
            className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => toggle(name)}
              className="rounded border-slate-300"
            />
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${managerChipColor(name, members)}`}
              aria-hidden
            />
            <span className={name === currentUser ? 'font-bold text-slate-900' : ''}>
              {name}
              {name === currentUser ? ' (나)' : ''}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
