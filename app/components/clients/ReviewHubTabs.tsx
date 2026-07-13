'use client';

import Link from 'next/link';

const TABS = [
  { id: 'review' as const, label: '결산', href: '/clients/review-sheet' },
  { id: 'vat' as const, label: '부가가치세', href: '/clients/vat-progress' },
];

export default function ReviewHubTabs({ active }: { active: 'review' | 'vat' }) {
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
