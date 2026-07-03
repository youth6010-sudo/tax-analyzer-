'use client';

import { useState, type ReactNode } from 'react';
import { noticeSection, noticeSectionTitle } from './noticeUi';

type Props = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export default function NoticeCollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={noticeSection}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className={noticeSectionTitle}>{title}</h2>
        <span className="shrink-0 text-xs font-medium text-slate-500">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">{children}</div>}
    </section>
  );
}
