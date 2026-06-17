'use client';

import { useEffect, useState } from 'react';
import HomeTasksPanel from './HomeTasksPanel';

const STORAGE_KEY = 'homeTasksSidebarOpen';

export default function HomeTasksSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '0') setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={`shrink-0 border-r border-gray-200 bg-white transition-[width] duration-200 ${
          open ? 'w-80' : 'w-11'
        }`}
      >
        <div className={`sticky top-0 flex flex-col ${open ? 'p-3' : 'py-3 px-1'}`}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            title={open ? '할 일 패널 접기' : '할 일 패널 펼치기'}
            className={`flex items-center gap-2 rounded-xl font-bold text-amber-900 transition-colors hover:bg-amber-50 ${
              open ? 'px-3 py-2 text-sm w-full justify-between' : 'w-full justify-center py-3'
            }`}
          >
            {open ? (
              <>
                <span>내 할 일</span>
                <span className="text-gray-400 text-xs" aria-hidden>◀</span>
              </>
            ) : (
              <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">할 일</span>
            )}
          </button>
          {open && (
            <div className="mt-2 min-w-0">
              <HomeTasksPanel />
            </div>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
