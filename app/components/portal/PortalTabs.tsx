'use client';

type Tab = {
  id: string;
  label: string;
  badge?: string | number;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export default function PortalTabs({ tabs, active, onChange, className = '' }: Props) {
  return (
    <div className={`flex flex-wrap gap-1 border-b border-slate-200 ${className}`.trim()}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {tab.label}
            {tab.badge != null && (
              <span
                className={[
                  'ml-1.5 tabular-nums text-xs font-semibold',
                  isActive ? 'text-blue-600' : 'text-slate-400',
                ].join(' ')}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
