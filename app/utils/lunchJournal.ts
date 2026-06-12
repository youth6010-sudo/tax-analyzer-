import type { LunchJournalStore, LunchSpotJournal, LunchVisit } from '../types/lunchJournal';

export const LUNCH_JOURNAL_KEY = 'lunch-journal-v2';
export const LUNCH_JOURNAL_KEY_LEGACY = 'lunch-journal-v1';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateStrFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayDateStr(): string {
  return dateStrFromDate(new Date());
}

export function yesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateStrFromDate(d);
}

export function formatVisitDate(date: string): string {
  const [y, m, day] = date.split('-');
  if (!y || !m || !day) return date;
  return `${y}.${m}.${day}`;
}

export function newVisitId(): string {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeVisit(raw: Partial<LunchVisit> & { date: string; rating: number }): LunchVisit {
  return {
    id: raw.id ?? newVisitId(),
    date: raw.date,
    rating: Math.min(5, Math.max(1, Math.round(raw.rating))),
    review: (raw.review ?? '').trim(),
    author: (raw.author ?? '').trim() || '익명',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt,
  };
}

function normalizeStore(raw: unknown): LunchJournalStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LunchJournalStore = {};
  for (const [spotId, val] of Object.entries(raw as LunchJournalStore)) {
    const journal = val as LunchSpotJournal;
    if (!journal?.visits || !Array.isArray(journal.visits)) continue;
    out[spotId] = {
      spotId,
      visits: journal.visits.map(v => normalizeVisit(v as LunchVisit)),
    };
  }
  return out;
}

export function loadJournal(): LunchJournalStore {
  if (typeof window === 'undefined') return {};
  try {
    let raw = localStorage.getItem(LUNCH_JOURNAL_KEY);
    if (!raw) {
      raw = localStorage.getItem(LUNCH_JOURNAL_KEY_LEGACY);
    }
    if (!raw) return {};
    return normalizeStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveJournal(store: LunchJournalStore): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LUNCH_JOURNAL_KEY, JSON.stringify(store));
}

export function getSpotJournal(store: LunchJournalStore, spotId: string): LunchSpotJournal {
  return store[spotId] ?? { spotId, visits: [] };
}

export function getLastVisit(journal: LunchSpotJournal): LunchVisit | null {
  if (journal.visits.length === 0) return null;
  return journal.visits[journal.visits.length - 1] ?? null;
}

export function getVisitOnDate(journal: LunchSpotJournal, date: string): LunchVisit | null {
  return journal.visits.find(v => v.date === date) ?? null;
}

export function getAverageRating(journal: LunchSpotJournal): number | null {
  if (journal.visits.length === 0) return null;
  const sum = journal.visits.reduce((acc, v) => acc + v.rating, 0);
  return Math.round((sum / journal.visits.length) * 10) / 10;
}

export function ateOnDate(journal: LunchSpotJournal, date: string): boolean {
  return journal.visits.some(v => v.date === date);
}

export function upsertVisit(
  spotId: string,
  payload: { rating: number; review: string; date?: string; author?: string },
): LunchJournalStore {
  const store = loadJournal();
  const journal = getSpotJournal(store, spotId);
  const date = payload.date ?? todayDateStr();
  const author = (payload.author ?? '').trim() || '익명';
  const existing = journal.visits.find(v => v.date === date);

  let visits: LunchVisit[];
  if (existing) {
    visits = journal.visits.map(v =>
      v.id === existing.id
        ? normalizeVisit({
            ...v,
            rating: payload.rating,
            review: payload.review,
            author,
            updatedAt: new Date().toISOString(),
          })
        : v,
    );
  } else {
    visits = [
      ...journal.visits,
      normalizeVisit({
        id: newVisitId(),
        date,
        rating: payload.rating,
        review: payload.review,
        author,
        createdAt: new Date().toISOString(),
      }),
    ];
  }

  const next: LunchJournalStore = {
    ...store,
    [spotId]: { spotId, visits },
  };
  saveJournal(next);
  return next;
}

export function updateVisit(
  spotId: string,
  visitId: string,
  payload: { rating: number; review: string; author?: string },
): LunchJournalStore {
  const store = loadJournal();
  const journal = getSpotJournal(store, spotId);
  const author = (payload.author ?? '').trim() || '익명';

  const next: LunchJournalStore = {
    ...store,
    [spotId]: {
      spotId,
      visits: journal.visits.map(v =>
        v.id === visitId
          ? normalizeVisit({
              ...v,
              rating: payload.rating,
              review: payload.review,
              author,
              updatedAt: new Date().toISOString(),
            })
          : v,
      ),
    },
  };
  saveJournal(next);
  return next;
}

export function deleteVisit(spotId: string, visitId: string): LunchJournalStore {
  const store = loadJournal();
  const journal = getSpotJournal(store, spotId);
  const visits = journal.visits.filter(v => v.id !== visitId);

  const next = { ...store };
  if (visits.length === 0) {
    delete next[spotId];
  } else {
    next[spotId] = { spotId, visits };
  }
  saveJournal(next);
  return next;
}

export function cancelTodayVisit(spotId: string): LunchJournalStore {
  const store = loadJournal();
  const journal = getSpotJournal(store, spotId);
  const today = todayDateStr();
  const visits = journal.visits.filter(v => v.date !== today);

  const next = { ...store };
  if (visits.length === 0) {
    delete next[spotId];
  } else {
    next[spotId] = { spotId, visits };
  }
  saveJournal(next);
  return next;
}

export function getEatenSpotIds(store: LunchJournalStore, dates: string[]): string[] {
  const set = new Set(dates);
  return Object.values(store)
    .filter(j => j.visits.some(v => set.has(v.date)))
    .map(j => j.spotId);
}

export function getRecentEatenSpotIds(store: LunchJournalStore): string[] {
  return getEatenSpotIds(store, [todayDateStr(), yesterdayDateStr()]);
}

/** @deprecated use getRecentEatenSpotIds */
export function getTodayEatenSpotIds(store: LunchJournalStore, date = todayDateStr()): string[] {
  return getEatenSpotIds(store, [date]);
}
