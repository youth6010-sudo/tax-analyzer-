'use client';

import { useMemo, useState } from 'react';
import type { LunchCategory, LunchSpot } from '@/app/types/lunch';
import { LUNCH_CATEGORIES } from '@/app/types/lunch';
import type { LunchJournalStore } from '@/app/types/lunchJournal';
import { getSpotJournal } from '@/app/utils/lunchJournal';
import { filterLunchSpots } from '@/app/utils/lunchPick';
import LunchSpotCard from './LunchSpotCard';

interface LunchSpotListProps {
  spots: LunchSpot[];
  journal: LunchJournalStore;
  onRecordVisit: (spotId: string, rating: number, review: string) => void;
  onEditVisit: (spotId: string, visitId: string, rating: number, review: string) => void;
  onDeleteVisit: (spotId: string, visitId: string) => void;
  onCancelToday: (spotId: string) => void;
}

export default function LunchSpotList({
  spots,
  journal,
  onRecordVisit,
  onEditVisit,
  onDeleteVisit,
  onCancelToday,
}: LunchSpotListProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LunchCategory | 'all'>('all');

  const filtered = useMemo(
    () => filterLunchSpots(spots, query, category),
    [spots, query, category],
  );

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-gray-900">맛집 도감</h2>
          <p className="mt-1 text-sm text-gray-500">{filtered.length}곳 · 별점·리뷰는 이 브라우저에 저장</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름, 태그 검색"
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value as LunchCategory | 'all')}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="all">전체 카테고리</option>
            {LUNCH_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {filtered.map(spot => (
          <LunchSpotCard
            key={spot.id}
            spot={spot}
            journal={getSpotJournal(journal, spot.id)}
            onRecordVisit={onRecordVisit}
            onEditVisit={onEditVisit}
            onDeleteVisit={onDeleteVisit}
            onCancelToday={onCancelToday}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-center text-sm text-gray-500 py-8 rounded-2xl border border-dashed border-gray-200 bg-white">
          조건에 맞는 맛집이 없습니다.
        </p>
      )}
    </section>
  );
}
