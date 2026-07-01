'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TAX_MENU } from '@/app/config/taxTypes';

export default function HomeSidebarNav() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setIsAdmin(data?.user?.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  const groups = TAX_MENU.filter(g => !('adminOnly' in g && g.adminOnly) || isAdmin);

  return (
    <nav className="space-y-2.5 text-sm" aria-label="포털 메뉴">
      {groups.map(group => {
        if ('href' in group) {
          const href = group.href as string;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <div key={group.id}>
              <Link
                href={href}
                className={`block rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                {group.label}
              </Link>
            </div>
          );
        }
        return (
          <div key={group.id}>
            <p className="px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.label}</p>
            <ul className="mt-0.5 space-y-0.5">
              {group.items.map(item => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-lg px-2.5 py-1.5 transition-colors ${
                        active
                          ? 'bg-blue-50 font-semibold text-blue-800 ring-1 ring-blue-200'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
