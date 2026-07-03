import { TAX_MENU } from '@/app/config/taxTypes';

function allTaxMenuHrefs(): string[] {
  const hrefs: string[] = [];
  for (const group of TAX_MENU) {
    if ('href' in group) hrefs.push(group.href as string);
    else for (const item of group.items) hrefs.push(item.href);
  }
  return hrefs;
}

/** 사이드바·메뉴 — 더 구체적인 메뉴 href가 있으면 짧은 prefix는 비활성 (예: /clients vs /clients/intake) */
export function isNavHrefActive(
  pathname: string,
  href: string,
  _siblingHrefs?: readonly string[],
): boolean {
  const [path] = href.split('?');
  if (pathname === path) return true;
  if (!pathname.startsWith(`${path}/`)) return false;

  const peers = allTaxMenuHrefs();
  const moreSpecific = peers.some(sibling => {
    if (sibling === href) return false;
    const [siblingPath] = sibling.split('?');
    if (!siblingPath.startsWith(`${path}/`)) return false;
    return pathname === siblingPath || pathname.startsWith(`${siblingPath}/`);
  });

  return !moreSpecific;
}
