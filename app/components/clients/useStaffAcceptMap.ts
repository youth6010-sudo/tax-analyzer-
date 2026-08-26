'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PresenceStaffDto } from '@/lib/presence';
import { getManagerMatchNames, managerNamesMatch } from '@/app/utils/managerMatch';

export type AcceptEntry = {
  userId: string | null;
  acceptIndividual: boolean;
  acceptCorporate: boolean;
};

type AcceptMap = Record<string, AcceptEntry>;

function indexStaff(staff: PresenceStaffDto[]): AcceptMap {
  const next: AcceptMap = {};
  for (const s of staff) {
    const entry: AcceptEntry = {
      userId: s.id,
      acceptIndividual: !!s.acceptIndividual,
      acceptCorporate: !!s.acceptCorporate,
    };
    for (const alias of getManagerMatchNames(s.name)) {
      next[alias] = entry;
    }
  }
  return next;
}

function lookup(map: AcceptMap, managerName: string): AcceptEntry | undefined {
  if (map[managerName]) return map[managerName];
  for (const alias of getManagerMatchNames(managerName)) {
    if (map[alias]) return map[alias];
  }
  return undefined;
}

/** presence 기반 담당자별 신규수신 ON/OFF (닉네임·실명 모두 키) */
export function useStaffAcceptMap() {
  const [byName, setByName] = useState<AcceptMap>({});
  const [loaded, setLoaded] = useState(false);
  const [canProxy, setCanProxy] = useState(false);
  const [selfName, setSelfName] = useState<string | null>(null);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);

  const applyStaff = useCallback((staff: PresenceStaffDto[]) => {
    setByName(indexStaff(staff));
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/presence', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = (await res.json()) as { staff?: PresenceStaffDto[] };
      applyStaff(Array.isArray(data.staff) ? data.staff : []);
    } catch {
      /* ignore */
    }
  }, [applyStaff]);

  useEffect(() => {
    void refresh();
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) setSelfName(String(data.user.name).trim());
        if (data?.user?.id) setSelfUserId(String(data.user.id));
        if (data?.isDeveloper) setCanProxy(true);
      })
      .catch(() => {});
  }, [refresh]);

  /** 본인 prefs가 presence에 아직 없으면 GET으로 시드 */
  useEffect(() => {
    if (!selfName) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/me/accept-clients', { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          acceptIndividual?: boolean;
          acceptCorporate?: boolean;
        };
        if (cancelled) return;
        const entry: AcceptEntry = {
          userId: selfUserId,
          acceptIndividual: !!data.acceptIndividual,
          acceptCorporate: !!data.acceptCorporate,
        };
        setByName(prev => {
          if (lookup(prev, selfName)) return prev;
          const next = { ...prev };
          for (const alias of getManagerMatchNames(selfName)) {
            next[alias] = entry;
          }
          return next;
        });
        setLoaded(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selfName, selfUserId]);

  const getAccept = useCallback(
    (managerName: string): AcceptEntry =>
      lookup(byName, managerName) ?? {
        userId: null,
        acceptIndividual: false,
        acceptCorporate: false,
      },
    [byName],
  );

  const canToggle = useCallback(
    (managerName: string) => {
      if (canProxy) return true;
      if (!selfName) return false;
      return managerNamesMatch(selfName, managerName);
    },
    [selfName, canProxy],
  );

  const toggle = useCallback(
    async (managerName: string, kind: 'individual' | 'corporate') => {
      if (!canToggle(managerName)) return;

      const prev = getAccept(managerName);
      const isSelf = !!selfName && managerNamesMatch(selfName, managerName);
      const nextIndividual =
        kind === 'individual' ? !prev.acceptIndividual : prev.acceptIndividual;
      const nextCorporate = kind === 'corporate' ? !prev.acceptCorporate : prev.acceptCorporate;

      const optimistic: AcceptEntry = {
        userId: prev.userId ?? (isSelf ? selfUserId : null),
        acceptIndividual: nextIndividual,
        acceptCorporate: nextCorporate,
      };
      setByName(prevMap => {
        const next = { ...prevMap };
        for (const alias of getManagerMatchNames(managerName)) {
          next[alias] = optimistic;
        }
        if (selfName && isSelf) {
          for (const alias of getManagerMatchNames(selfName)) {
            next[alias] = optimistic;
          }
        }
        return next;
      });

      try {
        const body: Record<string, unknown> = {
          individual: nextIndividual,
          corporate: nextCorporate,
        };
        if (!isSelf && prev.userId) {
          body.userId = prev.userId;
        }
        const res = await fetch('/api/auth/me/accept-clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          await refresh();
        }
      } catch {
        await refresh();
      }
    },
    [canToggle, getAccept, selfName, selfUserId, refresh],
  );

  return { getAccept, loaded, canToggle, toggle, refresh };
}
