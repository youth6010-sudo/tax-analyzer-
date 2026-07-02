'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  clearPortalSyncError,
  hydratePortal,
  prefetchPortal,
  reconcilePortalUser,
  usePortalSyncError,
} from '@/app/utils/portalStore';

/** 모든 페이지 헤더에서 포털 데이터 선로딩 */
export default function PortalPrefetch() {
  const syncError = usePortalSyncError();

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

  if (!syncError) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
        <span>{syncError}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void prefetchPortal(true)}
            className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold hover:bg-amber-100"
          >
            다시 시도
          </button>
          {syncError.includes('로그인') && (
            <Link
              href="/login"
              className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold hover:bg-amber-100"
            >
              로그인
            </Link>
          )}
          <button
            type="button"
            onClick={() => clearPortalSyncError()}
            className="text-amber-800/70 hover:text-amber-950"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
