const PREFIX = 'portalCache:';

type CacheEntry<T> = { at: number; data: T };

export function readClientCache<T>(key: string, maxAgeMs = 15 * 60 * 1000): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - at > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}

/** 만료 여부와 관계없이 마지막 캐시 (즉시 표시용) */
export function readClientCacheStale<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return (JSON.parse(raw) as CacheEntry<T>).data;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}
