'use client';

import { useEffect } from 'react';
import {
  hydratePortal,
  reconcilePortalUser,
} from '@/app/utils/portalStore';

/** 모든 페이지에서 포털 데이터 선로딩 (UI 없음) */
export default function PortalPrefetch() {
  useEffect(() => {
    let cancelled = false;

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
      void syncUser();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
