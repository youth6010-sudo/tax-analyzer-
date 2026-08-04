'use client';

import { useEffect, useState } from 'react';

/** 전체 데이터 조회 권한 (인디·개발자 관리자) */
export function useIsMasterUser(): boolean | null {
  const [isMaster, setIsMaster] = useState<boolean | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 12_000);
    fetch('/api/auth/me', { signal: ac.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setIsMaster(!!d?.isMaster))
      .catch(() => setIsMaster(false))
      .finally(() => window.clearTimeout(timer));
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return isMaster;
}

/** 개발자 관리자 — adminOnly 메뉴·타인 데이터 수정 */
export function useIsDeveloperAdmin(): boolean | null {
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 12_000);
    fetch('/api/auth/me', { signal: ac.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setIsDeveloper(!!d?.isDeveloper))
      .catch(() => setIsDeveloper(false))
      .finally(() => window.clearTimeout(timer));
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return isDeveloper;
}
