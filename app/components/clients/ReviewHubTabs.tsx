'use client';

import Link from 'next/link';

const TABS = [
  { id: 'annual' as const, label: '연간진행표', href: '/clients/annual-progress' },
  { id: 'vat' as const, label: '부가가치세', href: '/clients/vat-progress' },
  { id: 'review' as const, label: '결산', href: '/clients/review-sheet' },
];

export default function ReviewHubTabs({ active }: { active: 'review' | 'vat' | 'annual' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map(tab => {
        const on = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              on
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
