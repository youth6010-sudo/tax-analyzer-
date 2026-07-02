'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { portalBtnPrimary } from '@/app/components/portal/uiClasses';

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
    <div className="sticky top-0 z-20 mb-4 py-3 bg-[var(--background)]/95 backdrop-blur border-b border-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">유입</h1>
          <p className="portal-meta mt-0.5">유입관리 · 신규상담</p>
        </div>
        {active !== 'consultation' && (
          <Link href={href('consultation')} className={portalBtnPrimary}>
            + 신규상담
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {TABS.map(t => (
          <Link
            key={t.id}
            href={href(t.id)}
            className={[
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              active === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-slate-800',
            ].join(' ')}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
