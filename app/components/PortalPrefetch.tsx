'use client';

import { useEffect } from 'react';
import { hydratePortal, prefetchPortal } from '@/app/utils/portalStore';

/** 모든 페이지 헤더에서 포털 데이터 선로딩 */
export default function PortalPrefetch() {
  useEffect(() => {
    hydratePortal();

    const onFocus = () => {
      void prefetchPortal();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return null;
}
