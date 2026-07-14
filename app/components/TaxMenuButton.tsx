'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TAX_MENU } from '../config/taxTypes';
import { isNavHrefActive } from '../utils/navActive';

export default function TaxMenuButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canCharlieFeatures, setCanCharlieFeatures] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setIsAdmin(!!data?.isDeveloper);
        setCanCharlieFeatures(!!data?.canUseCharlieFeatures);
      })
      .catch(() => {
        setIsAdmin(false);
        setCanCharlieFeatures(false);
      });
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleToggle = useCallback(() => {
    setOpen(prev => !prev);
  }, []);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="세목 메뉴"
        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="hidden sm:inline">메뉴</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-56 z-50 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden py-1"
        >
          {TAX_MENU.filter(group => !('adminOnly' in group && group.adminOnly) || isAdmin).map(group => {
            // href만 있는 그룹(예: 블루홀)은 라벨 자체를 클릭 가능한 단일 메뉴로 렌더
            if ('href' in group) {
              const groupHref = group.href as string;
              const active = pathname === groupHref || pathname.startsWith(`${groupHref}/`);
              return (
                <div key={group.id} role="none" className="px-2 py-1.5">
                  <Link
                    href={groupHref}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2 text-sm rounded-xl font-semibold transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {group.label}
                  </Link>
                </div>
              );
            }
            return (
            <div key={group.id} role="none" className="px-2 py-1.5">
              <p
                role="none"
                className={`px-2 py-1 text-xs font-black uppercase tracking-wide ${
                  group.items.length > 0 ? 'text-gray-800' : 'text-gray-500 cursor-default'
                }`}
              >
                {group.label}
              </p>
              {group.items.length > 0 && (
                <ul role="none" className="mt-0.5 space-y-0.5">
                  {group.items
                    .filter(item => !('charlieOnly' in item && item.charlieOnly) || canCharlieFeatures)
                    .map(item => {
                    const active = isNavHrefActive(pathname, item.href);
                    return (
                      <li key={item.href} role="none">
                        <Link
                          href={item.href}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className={`block px-3 py-2 text-sm rounded-xl transition-colors ${
                            active
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'text-gray-700 hover:bg-gray-100 font-medium'
                          }`}
                          aria-current={active ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
