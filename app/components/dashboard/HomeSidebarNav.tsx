'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { isNavHrefActive } from '@/app/utils/navActive';
import { useMenuPrefs } from './MenuPrefsProvider';
import MenuEditModal from './MenuEditModal';
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
  const { groups, catalog, prefs, savePrefs, resetPrefs } = useMenuPrefs();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <nav className="space-y-4 text-sm" aria-label="포털 메뉴">
      <div className="px-1">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          메뉴 편집
        </button>
      </div>

      {groups.map(group => {
          if ('href' in group) {
            const href = group.href;
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
                {group.items.map(item => {
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

      <MenuEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        catalog={catalog}
        prefs={prefs}
        onSave={savePrefs}
        onReset={resetPrefs}
      />
    </nav>
  );
}
