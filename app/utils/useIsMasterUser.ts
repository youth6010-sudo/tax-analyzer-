'use client';

import { useEffect, useState } from 'react';

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
