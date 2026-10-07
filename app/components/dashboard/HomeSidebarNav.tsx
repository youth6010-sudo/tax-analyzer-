'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { ResolvedMenuChild, ResolvedMenuItem } from '@/lib/menuPrefs';
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

/** 하위(탭) 활성 — ?tab= 가 있는 형제가 있으면 쿼리까지 비교 */
function isChildActive(
  pathname: string,
  search: URLSearchParams,
  child: ResolvedMenuChild,
  siblings: ResolvedMenuChild[],
): boolean {
  const [path, query] = child.href.split('?');
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  const samePath = siblings.filter(s => s.href.split('?')[0] === path);
  if (samePath.length <= 1) return true;
  const want = new URLSearchParams(query ?? '').get('tab');
  const cur = search.get('tab');
  if (want) return cur === want;
  const otherTabs = samePath
    .map(s => new URLSearchParams(s.href.split('?')[1] ?? '').get('tab'))
    .filter(Boolean);
  return !cur || !otherTabs.includes(cur);
}

function ChildLinks({ pathname, items }: { pathname: string; items: ResolvedMenuChild[] }) {
  const search = useSearchParams();
  return (
    <ul className="mt-0.5 space-y-0.5 pl-9">
      {items.map(child => {
        const active = isChildActive(pathname, search, child, items);
        return (
          <li key={child.href}>
            <Link
              href={child.href}
              className={`block rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                active ? 'bg-[#4b6cb7]/10 font-semibold text-[#3b5aa3]' : 'text-slate-500 hover:bg-slate-100'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              {child.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ExpandableItem({ item, pathname }: { item: ResolvedMenuItem; pathname: string }) {
  const children = item.children ?? [];
  const active = children.some(c => isActive(pathname, c.href)) || isActive(pathname, item.href);
  const [openState, setOpenState] = useState<boolean | null>(null);
  const open = openState ?? active;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpenState(!open)}
        aria-expanded={open}
        className={`${linkBase} w-full text-left ${active ? 'font-semibold text-[#3b5aa3]' : linkInactive}`}
      >
        <SidebarNavIcon name={iconForHref(item.href)} />
        <span className="flex-1">{item.label}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <Suspense fallback={null}>
          <ChildLinks pathname={pathname} items={children} />
        </Suspense>
      )}
    </li>
  );
}

export default function HomeSidebarNav() {
  const pathname = usePathname();
  const { loaded, groups, catalog, prefs, savePrefs, resetPrefs } = useMenuPrefs();
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

      {!loaded ? (
        <div className="px-3 py-2 text-[11px] text-slate-400">메뉴 불러오는 중…</div>
      ) : (
        groups.map(group => {
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
                  if (item.children?.length) {
                    return <ExpandableItem key={item.href} item={item} pathname={pathname} />;
                  }
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
        })
      )}

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
