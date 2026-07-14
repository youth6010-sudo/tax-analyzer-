'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TAX_MENU } from '@/app/config/taxTypes';
import { isNavHrefActive } from '@/app/utils/navActive';
import SidebarNavIcon, { iconForHref } from './SidebarNavIcon';

const linkBase = 'flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors';
const linkActive = 'bg-[#4b6cb7] font-semibold text-white shadow-sm';
const linkInactive = 'text-slate-600 hover:bg-slate-100';

function isActive(pathname: string, href: string): boolean {
  const [path, query] = href.split('?');
  if (query) {
    return pathname === path;
  }
  if (path === '/') return pathname === '/';
  return isNavHrefActive(pathname, href);
}

export default function HomeSidebarNav() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [canCharlieFeatures, setCanCharlieFeatures] = useState(false);

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

  const groups = TAX_MENU.filter(g => !('adminOnly' in g && g.adminOnly) || isAdmin);

  return (
    <nav className="space-y-4 text-sm" aria-label="포털 메뉴">
      {groups.map(group => {
        if ('href' in group) {
          const href = group.href as string;
          const active = isActive(pathname, href);
          return (
            <div key={group.id}>
              <Link
                href={href}
                className={`${linkBase} py-2.5 ${active ? linkActive : linkInactive}`}
              >
                <SidebarNavIcon name={iconForHref(href)} />
                {group.label}
              </Link>
            </div>
          );
        }
        return (
          <div key={group.id}>
            <p className="px-2 text-[11px] font-bold tracking-wide text-slate-400">{group.label}</p>
            <ul className="mt-1 space-y-0.5">
              {group.items
                .filter(item => !('charlieOnly' in item && item.charlieOnly) || canCharlieFeatures)
                .map(item => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`${linkBase} ${active ? linkActive : linkInactive}`}
                    >
                      <SidebarNavIcon name={iconForHref(item.href)} />
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
