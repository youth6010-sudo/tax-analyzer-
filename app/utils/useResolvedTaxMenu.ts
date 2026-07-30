'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildPrefsFromEditState,
  catalogMenuForEdit,
  resolveMenuGroups,
  type ResolvedMenuGroup,
  type UserMenuPrefs,
} from '@/lib/menuPrefs';
import {
  clearMenuCache,
  readMenuCache,
  writeMenuCache,
  type MenuAuthFlags,
} from '@/app/utils/menuPrefsCache';

const MENU_PREFS_EVENT = 'portal-menu-prefs-updated';

type AuthFlags = MenuAuthFlags;

function broadcastMenuPrefs(prefs: UserMenuPrefs) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MENU_PREFS_EVENT, { detail: prefs }));
}

export { clearMenuCache };

export function useResolvedTaxMenu() {
  const [auth, setAuth] = useState<AuthFlags>(() => {
    const cached = readMenuCache();
    return cached?.auth ?? { isAdmin: false, canCharlieFeatures: false };
  });
  const [prefs, setPrefs] = useState<UserMenuPrefs>(() => {
    const cached = readMenuCache();
    return cached?.prefs ?? {};
  });
  // 캐시가 있으면 즉시 표시. 없으면 fetch 완료 전까지 로딩(기본 메뉴 깜빡임 방지).
  const [loaded, setLoaded] = useState(() => readMenuCache() != null);

  const reload = useCallback(async () => {
    try {
      const [meRes, prefsRes] = await Promise.all([
        fetch('/api/auth/me', { signal: AbortSignal.timeout(10_000) }),
        fetch('/api/auth/me/menu-prefs', { signal: AbortSignal.timeout(10_000) }),
      ]);
      const me = meRes.ok ? await meRes.json() : null;
      const prefsJson = prefsRes.ok ? await prefsRes.json() : null;
      const nextAuth: AuthFlags = {
        isAdmin: !!me?.isDeveloper,
        canCharlieFeatures: !!me?.canUseCharlieFeatures,
      };
      const nextPrefs = (prefsJson?.prefs as UserMenuPrefs) ?? {};
      setAuth(nextAuth);
      setPrefs(nextPrefs);
      writeMenuCache(nextPrefs, nextAuth);
    } catch {
      // 네트워크 오류 시 캐시/현재 메뉴 유지 — 기본 메뉴로 덮어쓰지 않음
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<UserMenuPrefs>).detail;
      if (detail && typeof detail === 'object') {
        setPrefs(detail);
        setAuth(prev => {
          writeMenuCache(detail, prev);
          return prev;
        });
      }
    };
    window.addEventListener(MENU_PREFS_EVENT, onUpdated);
    return () => window.removeEventListener(MENU_PREFS_EVENT, onUpdated);
  }, []);

  const groups = useMemo(
    () => (loaded ? resolveMenuGroups(prefs, auth) : []),
    [loaded, prefs, auth],
  );

  const catalog = useMemo(
    () => (loaded ? catalogMenuForEdit(auth) : []),
    [loaded, auth],
  );

  const savePrefs = useCallback(async (next: UserMenuPrefs) => {
    const res = await fetch('/api/auth/me/menu-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: next }),
    });
    if (!res.ok) throw new Error('save failed');
    const data = await res.json();
    const saved = (data?.prefs as UserMenuPrefs) ?? next;
    setPrefs(saved);
    setAuth(prev => {
      writeMenuCache(saved, prev);
      return prev;
    });
    broadcastMenuPrefs(saved);
  }, []);

  const resetPrefs = useCallback(async () => {
    const res = await fetch('/api/auth/me/menu-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    if (!res.ok) throw new Error('reset failed');
    const data = await res.json();
    const saved = (data?.prefs as UserMenuPrefs) ?? {};
    setPrefs(saved);
    setAuth(prev => {
      writeMenuCache(saved, prev);
      return prev;
    });
    broadcastMenuPrefs(saved);
  }, []);

  return {
    loaded,
    auth,
    prefs,
    groups,
    catalog,
    savePrefs,
    resetPrefs,
    reload,
  };
}

export function prefsFromCatalogAndVisibility(
  catalog: ResolvedMenuGroup[],
  prefs: UserMenuPrefs,
): {
  groupOrder: string[];
  hiddenGroupIds: string[];
  itemOrderByGroup: Record<string, string[]>;
  hiddenHrefs: string[];
} {
  const defaultGroupOrder = catalog.map(g => g.id);
  const groupOrder = (() => {
    const preferred = prefs.groupOrder ?? [];
    const set = new Set(defaultGroupOrder);
    const out = preferred.filter(id => set.has(id));
    for (const id of defaultGroupOrder) {
      if (!out.includes(id)) out.push(id);
    }
    return out;
  })();

  const hiddenGroupIds = (prefs.hiddenGroupIds ?? []).filter(id => defaultGroupOrder.includes(id));

  const hiddenHrefs = new Set(prefs.hiddenHrefs ?? []);
  const itemOrderByGroup: Record<string, string[]> = {};
  for (const group of catalog) {
    if (!('items' in group)) continue;
    const defaults = group.items.map(i => i.href);
    const preferred = prefs.itemOrderByGroup?.[group.id] ?? [];
    const set = new Set(defaults);
    const ordered = preferred.filter(h => set.has(h));
    for (const h of defaults) {
      if (!ordered.includes(h)) ordered.push(h);
    }
    itemOrderByGroup[group.id] = ordered;
  }

  return {
    groupOrder,
    hiddenGroupIds,
    itemOrderByGroup,
    hiddenHrefs: [...hiddenHrefs],
  };
}

export { buildPrefsFromEditState };
