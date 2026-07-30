import type { UserMenuPrefs } from '@/lib/menuPrefs';

const MENU_CACHE_KEY = 'portalMenuPrefs:v1';

export type MenuAuthFlags = {
  isAdmin: boolean;
  canCharlieFeatures: boolean;
};

export type MenuCache = {
  prefs: UserMenuPrefs;
  auth: MenuAuthFlags;
};

export function readMenuCache(): MenuCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MenuCache;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      prefs: (parsed.prefs && typeof parsed.prefs === 'object' ? parsed.prefs : {}) as UserMenuPrefs,
      auth: {
        isAdmin: !!parsed.auth?.isAdmin,
        canCharlieFeatures: !!parsed.auth?.canCharlieFeatures,
      },
    };
  } catch {
    return null;
  }
}

export function writeMenuCache(prefs: UserMenuPrefs, auth: MenuAuthFlags): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ prefs, auth } satisfies MenuCache));
  } catch {
    /* quota */
  }
}

export function clearMenuCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MENU_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
