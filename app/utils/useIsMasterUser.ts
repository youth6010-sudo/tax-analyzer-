'use client';

import { useEffect, useState } from 'react';

function subscribeAuthMe(apply: (data: { isMaster?: boolean; isDeveloper?: boolean } | null) => void) {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 12_000);
  fetch('/api/auth/me', { signal: ac.signal })
    .then(r => (r.ok ? r.json() : null))
    .then(d => apply(d))
    .catch(() => apply(null))
    .finally(() => window.clearTimeout(timer));

  const onAuthChanged = () => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => apply(d))
      .catch(() => apply(null));
  };
  window.addEventListener('portal:auth-changed', onAuthChanged);

  return () => {
    ac.abort();
    window.clearTimeout(timer);
    window.removeEventListener('portal:auth-changed', onAuthChanged);
  };
}

/** 전체 데이터 조회 권한 (인디·개발자 관리자) */
export function useIsMasterUser(): boolean | null {
  const [isMaster, setIsMaster] = useState<boolean | null>(null);

  useEffect(() => {
    return subscribeAuthMe(d => setIsMaster(!!d?.isMaster));
  }, []);

  return isMaster;
}

/** 개발자 관리자 — adminOnly 메뉴·타인 데이터 수정 */
export function useIsDeveloperAdmin(): boolean | null {
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null);

  useEffect(() => {
    return subscribeAuthMe(d => setIsDeveloper(!!d?.isDeveloper));
  }, []);

  return isDeveloper;
}
