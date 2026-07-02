'use client';

export type CalendarViewMode = 'month' | 'week';

type Props = {
  year: number;
  month: number;
  mode: CalendarViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onModeChange: (mode: CalendarViewMode) => void;
};

export default function CalendarToolbar({
  year,
  month,
  mode,
  onPrev,
  onNext,
  onToday,
  onModeChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ‹
        </button>
        <h1 className="text-lg font-bold text-slate-900 min-w-[8rem] text-center">
          {year}년 {month}월
        </h1>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ›
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
        >
          오늘
        </button>
      </div>
      <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm font-semibold">
        <button
          type="button"
          onClick={() => onModeChange('month')}
          className={`rounded-md px-3 py-1.5 ${
            mode === 'month' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          월
        </button>
        <button
          type="button"
          onClick={() => onModeChange('week')}
          className={`rounded-md px-3 py-1.5 ${
            mode === 'week' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          주
        </button>
      </div>
    </div>
  );
}
