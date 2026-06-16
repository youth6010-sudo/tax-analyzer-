'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadJournal,
  upsertVisit,
  updateVisit as persistUpdateVisit,
  deleteVisit as persistDeleteVisit,
  cancelTodayVisit as persistCancelToday,
} from '@/app/utils/lunchJournal';
import type { LunchJournalStore } from '@/app/types/lunchJournal';

export function useLunchJournal() {
  const [store, setStore] = useState<LunchJournalStore>(() =>
    typeof window !== 'undefined' ? loadJournal() : {},
  );
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) setAuthorName(String(data.user.name));
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    setStore(loadJournal());
  }, []);

  const recordVisit = useCallback(
    (spotId: string, rating: number, review: string) => {
      const author = authorName.trim() || '익명';
      const next = upsertVisit(spotId, { rating, review, author });
      setStore(next);
    },
    [authorName],
  );

  const editVisit = useCallback(
    (spotId: string, visitId: string, rating: number, review: string) => {
      const author = authorName.trim() || '익명';
      const next = persistUpdateVisit(spotId, visitId, {
        rating,
        review,
        author,
      });
      setStore(next);
    },
    [authorName],
  );

  const removeVisit = useCallback((spotId: string, visitId: string) => {
    const next = persistDeleteVisit(spotId, visitId);
    setStore(next);
  }, []);

  const cancelToday = useCallback((spotId: string) => {
    const author = authorName.trim() || '익명';
    const next = persistCancelToday(spotId, author);
    setStore(next);
  }, [authorName]);

  return useMemo(
    () => ({
      store,
      authorName,
      refresh,
      recordVisit,
      editVisit,
      removeVisit,
      cancelToday,
    }),
    [store, authorName, refresh, recordVisit, editVisit, removeVisit, cancelToday],
  );
}
