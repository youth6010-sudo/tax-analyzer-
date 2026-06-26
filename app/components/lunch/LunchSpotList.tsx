'use client';

import { useMemo, useState } from 'react';
import type { LunchSpot } from '@/app/types/lunch';
import type { LunchJournalStore } from '@/app/types/lunchJournal';
import { getSpotJournal } from '@/app/utils/lunchJournal';
import { buildWalkDistanceBands, filterSpotsByDistanceBand } from '@/app/utils/lunchDistance';
import {
  portalCard,
  portalEmptyState,
  portalInput,
  portalSectionDesc,
  portalSectionTitle,
  portalSelect,
} from '@/app/components/portal/uiClasses';
import LunchSpotCard from './LunchSpotCard';

interface LunchSpotListProps {
  spots: LunchSpot[];
  journal: LunchJournalStore;
  authorName?: string;
  onRecordVisit: (spotId: string, rating: number, review: string) => void;
  onEditVisit: (spotId: string, visitId: string, rating: number, review: string) => void;
  onDeleteVisit: (spotId: string, visitId: string) => void;
  onCancelToday: (spotId: string) => void;
  onToggleActive?: (spotId: string, active: boolean) => void;
}

type StatusFilter = 'active' | 'inactive' | 'all';

export default function LunchSpotList({
  spots,
  journal,
  authorName = '',
  onRecordVisit,
  onEditVisit,
  onDeleteVisit,
  onCancelToday,
  onToggleActive,
}: LunchSpotListProps) {
  const [query, setQuery] = useState('');
  const [distanceBand, setDistanceBand] = useState<string | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('active');

  const activeCount = useMemo(() => spots.filter(s => s.active).length, [spots]);
  const inactiveCount = spots.length - activeCount;

  const bands = useMemo(() => buildWalkDistanceBands(spots, 4), [spots]);

  const filtered = useMemo(() => {
    let list = filterSpotsByDistanceBand(spots, distanceBand, bands);
    if (status === 'active') list = list.filter(s => s.active);
    else if (status === 'inactive') list = list.filter(s => !s.active);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(spot => {
      const haystack = [
        spot.name,
        spot.category,
        ...spot.tags,
        ...spot.menuHints,
        spot.notes ?? '',
        `도보 ${spot.walkMinutes}분`,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [spots, query, distanceBand, bands, status]);

  return (
    <section className="mt-10">
      <div className={`${portalCard} p-4 sm:p-5 mb-4`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className={portalSectionTitle}>맛집 도감</h2>
            <p className={portalSectionDesc}>
              {filtered.length}곳 표시 · 활성 {activeCount} / 비활성 {inactiveCount} · ‘활성화’한
              곳만 가챠에 나옵니다
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:min-w-[20rem]">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름, 태그 검색"
              className={`${portalInput} flex-1 min-w-[10rem]`}
            />
            <select
              value={distanceBand}
              onChange={e => setDistanceBand(e.target.value)}
              className={portalSelect}
            >
              <option value="all">전체 거리</option>
              {bands.map(band => (
                <option key={band.id} value={band.id}>
                  {band.emoji} {band.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {onToggleActive && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ['active', `활성 ${activeCount}`],
                ['inactive', `주변 더보기 ${inactiveCount}`],
                ['all', `전체 ${spots.length}`],
              ] as [StatusFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  status === key
                    ? 'border-orange-300 bg-orange-100 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map(spot => (
          <LunchSpotCard
            key={spot.id}
            spot={spot}
            journal={getSpotJournal(journal, spot.id)}
            currentAuthor={authorName}
            onRecordVisit={onRecordVisit}
            onEditVisit={onEditVisit}
            onDeleteVisit={onDeleteVisit}
            onCancelToday={onCancelToday}
            onToggleActive={onToggleActive}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className={portalEmptyState}>조건에 맞는 맛집이 없습니다.</p>
      )}
    </section>
  );
}
