'use client';

import { useEffect } from 'react';

const HEARTBEAT_MS = 45_000;

async function ping() {
  try {
    await fetch('/api/presence', { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* ignore network blips */
  }
}

/** 로그인 셸에서 last_seen heartbeat (45초 + 탭 복귀 시) */
export default function PresenceHeartbeat() {
  useEffect(() => {
    void ping();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void ping();
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
