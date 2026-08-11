'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  hydratePortal,
  reconcilePortalUser,
} from '@/app/utils/portalStore';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';

/** 모든 페이지에서 포털 데이터 선로딩 (UI 없음) */
export default function PortalPrefetch() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const syncUser = async () => {
      try {
        const res = await fetchWithTimeout('/api/auth/me', { credentials: 'same-origin' }, 10_000);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { user?: { id?: string } };
        if (cancelled) return;
        reconcilePortalUser(data?.user?.id);
      } catch {
        /* ignore */
      }
    };

    // auth/me가 느려도 bootstrap은 바로 시작 (병렬)
    hydratePortal();
    void syncUser();

    // 자주 쓰는 탭·목록 워밍 (Seoul Pro 체감)
    try {
      router.prefetch('/arrears');
      router.prefetch('/mail-ledger');
    } catch {
      /* ignore */
    }
    void fetchWithTimeout('/api/arrears?', { credentials: 'same-origin', cache: 'no-store' }, 15_000).catch(
      () => undefined,
    );
    void fetchWithTimeout('/api/mail-receipts?', { credentials: 'same-origin', cache: 'no-store' }, 15_000).catch(
      () => undefined,
    );

    const onFocus = () => {
      void syncUser();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [router]);

  return null;
}
