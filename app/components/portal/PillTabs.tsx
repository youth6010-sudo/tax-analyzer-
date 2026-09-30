'use client';

import Link from 'next/link';

export type PillTab<T extends string = string> = { id: T; label: string; href: string };

/** 검토표·미수관리 상단 탭 (링크형 알약 버튼) */
export default function PillTabs<T extends string>({
  tabs,
  active,
}: {
  tabs: ReadonlyArray<PillTab<T>>;
  active: T;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(tab => {
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
