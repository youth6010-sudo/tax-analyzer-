'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import PortalShellLayout from '@/app/components/dashboard/PortalShellLayout';

const NO_CHROME_PREFIXES = ['/login'];

function shouldSkipChrome(pathname: string): boolean {
  return NO_CHROME_PREFIXES.some(
    p => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * 좌측 메뉴·우측 To Do 셸을 라우트 이동 간에 유지한다.
 * 페이지마다 PortalPageShell이 셸을 다시 마운트하면
 * 메뉴/To Do가 매번 "불러오는 중…"으로 초기화된다.
 */
export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  if (shouldSkipChrome(pathname)) {
    return <>{children}</>;
  }
  return <PortalShellLayout>{children}</PortalShellLayout>;
}
