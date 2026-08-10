import { TAX_MENU } from '@/app/config/taxTypes';

function allTaxMenuHrefs(): string[] {
  const hrefs: string[] = [];
  for (const group of TAX_MENU) {
    if ('href' in group) hrefs.push(group.href as string);
    else for (const item of group.items) hrefs.push(item.href);
  }
  return hrefs;
}

/**
 * 검토표 허브 — 메뉴는 /clients/annual-progress 로 들어가고
 * 부가가치세·결산 탭은 별도 경로.
 */
export const REVIEW_HUB_PATHS = [
  '/clients/annual-progress',
  '/clients/vat-progress',
  '/clients/review-sheet',
] as const;

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isReviewHubPath(pathname: string): boolean {
  return REVIEW_HUB_PATHS.some(p => pathMatches(pathname, p));
}

/** 사이드바·메뉴 — 더 구체적인 메뉴 href가 있으면 짧은 prefix는 비활성 (예: /clients vs /clients/intake) */
export function isNavHrefActive(
  pathname: string,
  href: string,
  _siblingHrefs?: readonly string[],
): boolean {
  const [path] = href.split('?');

  // 검토표 메뉴: 허브 탭 전부 활성
  if (path === '/clients/annual-progress' || path === '/clients/review-sheet') {
    return isReviewHubPath(pathname);
  }

  if (pathname === path) return true;
  if (!pathname.startsWith(`${path}/`)) return false;

  const peers = allTaxMenuHrefs();
  const moreSpecific = peers.some(sibling => {
    if (sibling === href) return false;
    const [siblingPath] = sibling.split('?');

    // 검토표 허브 하위(/vat-progress 등)는 /clients보다 구체적
    if (
      (siblingPath === '/clients/annual-progress' || siblingPath === '/clients/review-sheet') &&
      isReviewHubPath(pathname)
    ) {
      return true;
    }

    if (!siblingPath.startsWith(`${path}/`)) return false;
    return pathname === siblingPath || pathname.startsWith(`${siblingPath}/`);
  });

  return !moreSpecific;
}
