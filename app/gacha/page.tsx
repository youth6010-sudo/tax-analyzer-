'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadLunchDatabase } from '@/app/utils/lunchData';
import type { LunchDatabase } from '@/app/types/lunch';
import LunchPickGame from '@/app/components/lunch/LunchPickGame';
import LunchSpotList from '@/app/components/lunch/LunchSpotList';
import LunchSpotRequestForm from '@/app/components/lunch/LunchSpotRequestForm';
import { useLunchJournal } from '@/app/components/lunch/useLunchJournal';
import ManagerGachaGame from '@/app/components/gacha/ManagerGachaGame';

type GachaTab = 'lunch' | 'manager';

function GachaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: GachaTab = searchParams.get('tab') === 'manager' ? 'manager' : 'lunch';

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
    if (tab !== 'lunch') return;
    loadLunchDatabase()
      .then(setDb)
      .catch(e => setError(String(e)));
  }, [tab]);

  const switchTab = (next: GachaTab) => {
    router.replace(next === 'lunch' ? '/gacha' : '/gacha?tab=manager', { scroll: false });
  };

  const subtitle = useMemo(() => {
    if (tab === 'manager') return '담당자 후보를 넣고 가챠로 한 명 뽑기';
    return db?.officeLabel ? `${db.officeLabel} · 캡슐 뽑기 = 오늘 점심` : '캡슐 뽑기 = 오늘 점심';
  }, [tab, db?.officeLabel]);

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">가챠머신 🎰</h1>
          <p className="mt-2 text-sm text-gray-600">
            {subtitle}
            {tab === 'lunch' && authorName && (
              <span className="text-gray-400"> · 리뷰 작성자: {authorName}</span>
            )}
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchTab('lunch')}
            className={[
              'px-5 py-2.5 text-sm font-black rounded-xl border transition-all',
              tab === 'lunch'
                ? 'bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-500/25'
                : 'bg-white text-gray-600 border-gray-200 hover:border-orange-200 hover:bg-orange-50',
            ].join(' ')}
          >
            🍱 점심
          </button>
          <button
            type="button"
            onClick={() => switchTab('manager')}
            className={[
              'px-5 py-2.5 text-sm font-black rounded-xl border transition-all',
              tab === 'manager'
                ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/25'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50',
            ].join(' ')}
          >
            👤 담당자
          </button>
        </div>

        {tab === 'manager' && <ManagerGachaGame />}

        {tab === 'lunch' && (
          <>
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
                  방문·리뷰는 브라우저에 저장 · 맛집 목록: {db.updatedAt}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function GachaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-sm text-gray-500">불러오는 중…</p>
        </main>
      }
    >
      <GachaPageContent />
    </Suspense>
  );
}
