'use client';

import { useEffect, useState } from 'react';

/** 전체 데이터 조회 권한 (인디·개발자 관리자) */
export function useIsMasterUser(): boolean | null {
  const [isMaster, setIsMaster] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setIsMaster(!!d?.isMaster))
      .catch(() => setIsMaster(false));
  }, []);

  return isMaster;
}

/** 개발자 관리자 — adminOnly 메뉴·타인 데이터 수정 */
export function useIsDeveloperAdmin(): boolean | null {
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setIsDeveloper(!!d?.isDeveloper))
      .catch(() => setIsDeveloper(false));
  }, []);

  return isDeveloper;
}
