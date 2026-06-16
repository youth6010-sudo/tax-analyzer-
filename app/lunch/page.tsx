'use client';

import { useEffect, useState } from 'react';
import { loadLunchDatabase } from '@/app/utils/lunchData';
import type { LunchDatabase } from '@/app/types/lunch';
import LunchPickGame from '@/app/components/lunch/LunchPickGame';
import LunchSpotList from '@/app/components/lunch/LunchSpotList';
import LunchSpotRequestForm from '@/app/components/lunch/LunchSpotRequestForm';
import { useLunchJournal } from '@/app/components/lunch/useLunchJournal';

export default function LunchPage() {
  const [db, setDb] = useState<LunchDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    store,
    authorName,
    recordVisit,
    editVisit,
    removeVisit,
    cancelToday,
  } = useLunchJournal();

  useEffect(() => {
    loadLunchDatabase()
      .then(setDb)
      .catch(e => setError(String(e)));
  }, []);

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">점심 가챠머신 🎰</h1>
          <p className="mt-2 text-sm text-gray-600">
            {db?.officeLabel ?? '사무실 주변'} · 캡슐 뽑기 = 오늘 점심
            {authorName && (
              <span className="text-gray-400"> · 리뷰 작성자: {authorName}</span>
            )}
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!db && !error && (
          <p className="text-sm text-gray-500 py-12 text-center">맛집 목록을 불러오는 중…</p>
        )}

        {db && (
          <>
            <LunchPickGame
              spots={db.spots}
              journal={store}
              authorName={authorName}
              onRecordVisit={recordVisit}
              onEditVisit={editVisit}
              onDeleteVisit={removeVisit}
              onCancelToday={cancelToday}
            />
            <LunchSpotList
              spots={db.spots}
              journal={store}
              authorName={authorName}
              onRecordVisit={recordVisit}
              onEditVisit={editVisit}
              onDeleteVisit={removeVisit}
              onCancelToday={cancelToday}
            />
            <LunchSpotRequestForm />
            <p className="mt-8 text-xs text-gray-400 text-center">
              방문·리뷰는 브라우저에 저장 (같은 PC에서 로그인한 사람마다 각자 리뷰 가능) · 맛집 목록: {db.updatedAt}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
