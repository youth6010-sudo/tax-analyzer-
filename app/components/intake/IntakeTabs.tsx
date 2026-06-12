'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type IntakeTab = 'intake' | 'consultation';

const TABS: { id: IntakeTab; label: string }[] = [
  { id: 'intake', label: '유입관리' },
  { id: 'consultation', label: '신규상담' },
];

export function resolveIntakeTab(raw: string | null): IntakeTab {
  if (raw === 'consultation') return 'consultation';
  return 'intake';
}

export default function IntakeTabs({ active }: { active: IntakeTab }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href = (tab: IntakeTab) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('tab', tab);
    if (tab === 'consultation') p.delete('q');
    return `${pathname}?${p.toString()}`;
  };

  return (
    <div className="sticky top-[4.25rem] z-30 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-2.5 bg-gray-50/98 backdrop-blur border-b border-gray-200 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-gray-900">유입</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">유입관리 · 신규상담</p>
        </div>
        {active !== 'consultation' && (
          <Link
            href={href('consultation')}
            className="px-3 py-1.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            + 신규상담
          </Link>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {TABS.map(t => (
          <Link
            key={t.id}
            href={href(t.id)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
              active === t.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
