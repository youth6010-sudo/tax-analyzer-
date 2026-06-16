import type { LunchCategory, LunchSpot } from '../types/lunch';

export const LUNCH_RECENT_KEY = 'lunch-recent-v1';
export const LUNCH_RECENT_MAX = 5;

export interface PickLunchOptions {
  category?: LunchCategory | 'all';
  excludeIds?: string[];
}

export function pickLunchSpot(spots: LunchSpot[], options: PickLunchOptions = {}): LunchSpot | null {
  const { category = 'all', excludeIds = [] } = options;
  const exclude = new Set(excludeIds);

  let pool = spots.filter(s => !exclude.has(s.id));
  if (category !== 'all') {
    pool = pool.filter(s => s.category === category);
  }

  if (pool.length === 0 && excludeIds.length > 0) {
    pool = category === 'all' ? spots : spots.filter(s => s.category === category);
  }

  if (pool.length === 0) return null;

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? null;
}

/** 승부차기용 — 서로 다른 두 후보 (풀이 1개면 동일 반환) */
export function pickTwoLunchSpots(spots: LunchSpot[], excludeIds: string[] = []): [LunchSpot, LunchSpot] | null {
  if (spots.length === 0) return null;
  const first = pickLunchSpot(spots, { excludeIds });
  if (!first) return null;
  if (spots.length === 1) return [first, first];
  const second = pickLunchSpot(spots, { excludeIds: [...excludeIds, first.id] });
  if (!second) return [first, first];
  return [first, second];
}

export function loadRecentIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LUNCH_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveRecentId(id: string): void {
  if (typeof window === 'undefined') return;
  const prev = loadRecentIds().filter(x => x !== id);
  const next = [id, ...prev].slice(0, LUNCH_RECENT_MAX);
  localStorage.setItem(LUNCH_RECENT_KEY, JSON.stringify(next));
}

export function filterLunchSpots(
  spots: LunchSpot[],
  query: string,
  category: LunchCategory | 'all',
): LunchSpot[] {
  const q = query.trim().toLowerCase();
  return spots.filter(spot => {
    if (category !== 'all' && spot.category !== category) return false;
    if (!q) return true;
    const haystack = [
      spot.name,
      spot.category,
      ...spot.tags,
      ...spot.menuHints,
      spot.notes ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
