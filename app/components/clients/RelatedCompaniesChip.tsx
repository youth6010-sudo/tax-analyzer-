'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type RelatedCompanyLink = {
  name: string;
  id: string | null;
};

/** 수임처 목록 — 상호 옆 「관계 N」칩 + 연결 목록 */
export default function RelatedCompaniesChip({
  links,
}: {
  links: RelatedCompanyLink[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!links.length) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="rounded px-1 py-px text-[10px] font-semibold text-teal-800 bg-teal-100 ring-1 ring-teal-200/80 hover:bg-teal-200/70"
        title={links.map(l => l.name).join(', ')}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        관계 {links.length}
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-40 mt-1 min-w-[10rem] max-w-[16rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onClick={e => e.stopPropagation()}
        >
          <p className="px-2.5 py-1 text-[10px] font-semibold text-slate-500">연결 수임처</p>
          <ul className="max-h-48 overflow-y-auto">
            {links.map(link => (
              <li key={`${link.id ?? 'x'}-${link.name}`}>
                {link.id ? (
                  <Link
                    href={`/clients/${link.id}`}
                    className="block truncate px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-slate-50"
                    onClick={() => setOpen(false)}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <span className="block truncate px-2.5 py-1 text-xs text-slate-600">
                    {link.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
