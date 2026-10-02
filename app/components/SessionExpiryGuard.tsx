'use client';

import { useEffect } from 'react';

const LOGIN_PATH = '/login';
const PUBLIC_API = ['/api/auth/login', '/api/auth/login-users'];

function apiPathOf(input: RequestInfo | URL): string | null {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url.pathname.startsWith('/api/') ? url.pathname : null;
  } catch {
    return null;
  }
}

/** 세션(24시간) 만료 후 열린 탭에서 API가 401이면 조용히 실패하지 않도록 로그인 화면으로 보냄 */
export default function SessionExpiryGuard() {
  useEffect(() => {
    const originalFetch = window.fetch;
    let redirecting = false;

    window.fetch = async (input, init) => {
      const res = await originalFetch(input, init);
      if (res.status !== 401 || redirecting) return res;
      const path = apiPathOf(input);
      if (!path || PUBLIC_API.includes(path)) return res;
      if (window.location.pathname === LOGIN_PATH) return res;
      // 일부 라우트는 기타 오류도 401로 응답 — 세션이 실제로 끊겼을 때만 이동
      if (path !== '/api/auth/me') {
        const me = await originalFetch('/api/auth/me', { cache: 'no-store' }).catch(() => null);
        if (!me || me.status !== 401) return res;
      }
      if (redirecting) return res;
      redirecting = true;
      window.alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.href = `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
