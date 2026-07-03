'use client';

type Props = {
  value: 'mine' | 'all';
  onChange: (v: 'mine' | 'all') => void;
  mineLabel?: string;
  allLabel?: string;
  className?: string;
};

export default function ScopeToggle({
  value,
  onChange,
  mineLabel = '내 담당',
  allLabel = '전체',
  className = '',
}: Props) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 ring-1 ring-slate-200 ${className}`}
    >
      {(['mine', 'all'] as const).map(key => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === key
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {key === 'mine' ? mineLabel : allLabel}
        </button>
      ))}
    </div>
  );
}
