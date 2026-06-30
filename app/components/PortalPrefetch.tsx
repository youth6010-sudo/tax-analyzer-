'use client';

import { useEffect } from 'react';
import { hydratePortal, prefetchPortal, reconcilePortalUser } from '@/app/utils/portalStore';

/** 모든 페이지 헤더에서 포털 데이터 선로딩 */
export default function PortalPrefetch() {
  useEffect(() => {
    let cancelled = false;

    // 현재 세션 사용자와 캐시 소유자가 다르면 비운다(사용자 전환 보장).
    const syncUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { user?: { id?: string } };
        if (cancelled) return;
        reconcilePortalUser(data?.user?.id);
      } catch {
        /* ignore */
      }
    };

    void syncUser().finally(() => {
      if (!cancelled) hydratePortal();
    });

    const onFocus = () => {
      void syncUser().finally(() => {
        if (!cancelled) void prefetchPortal();
      });
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
