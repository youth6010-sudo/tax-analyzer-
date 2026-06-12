'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LunchCategory, LunchSpot } from '@/app/types/lunch';
import { LUNCH_CATEGORIES } from '@/app/types/lunch';
import { pickLunchSpot, saveRecentId, loadRecentIds } from '@/app/utils/lunchPick';
import { getRecentEatenSpotIds } from '@/app/utils/lunchJournal';
import type { LunchJournalStore } from '@/app/types/lunchJournal';
import LunchSpotCard from './LunchSpotCard';
import LunchGachaMachine from './LunchGachaMachine';
import { GACHA_TIMINGS, type GachaPhase } from './gachaTimings';

interface LunchPickGameProps {
  spots: LunchSpot[];
  journal: LunchJournalStore;
  onRecordVisit: (spotId: string, rating: number, review: string) => void;
  onEditVisit: (spotId: string, visitId: string, rating: number, review: string) => void;
  onDeleteVisit: (spotId: string, visitId: string) => void;
  onCancelToday: (spotId: string) => void;
}

export default function LunchPickGame({
  spots,
  journal,
  onRecordVisit,
  onEditVisit,
  onDeleteVisit,
  onCancelToday,
}: LunchPickGameProps) {
  const [category, setCategory] = useState<LunchCategory | 'all'>('all');
  const [phase, setPhase] = useState<GachaPhase>('idle');
  const [resultName, setResultName] = useState('');
  const [teaseName, setTeaseName] = useState('');
  const [picked, setPicked] = useState<LunchSpot | null>(null);
  const [showCard, setShowCard] = useState(false);
  const timersRef = useRef<number[]>([]);
  const teaseTimerRef = useRef<number | null>(null);

  const playing = phase !== 'idle';

  const pool = useMemo(() => {
    let list = category === 'all' ? spots : spots.filter(s => s.category === category);
    const eaten = new Set(getRecentEatenSpotIds(journal));
    const filtered = list.filter(s => !eaten.has(s.id));
    if (filtered.length > 0) list = filtered;
    return list;
  }, [spots, category, journal]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current = [];
    if (teaseTimerRef.current) {
      window.clearInterval(teaseTimerRef.current);
      teaseTimerRef.current = null;
    }
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const randomName = useCallback(
    () => pool[Math.floor(Math.random() * pool.length)]?.name ?? '',
    [pool],
  );

  const handleDraw = useCallback(() => {
    if (pool.length === 0 || playing) return;

    clearTimers();
    setShowCard(false);
    setPicked(null);
    setResultName('');
    setTeaseName('');

    const recent = loadRecentIds();
    const result = pickLunchSpot(pool, { category: 'all', excludeIds: recent });

    setPhase('crank');

    schedule(() => {
      setPhase('spin');
      setTeaseName(randomName());
      teaseTimerRef.current = window.setInterval(() => {
        setTeaseName(randomName());
      }, 120);
    }, GACHA_TIMINGS.crankMs);

    schedule(() => {
      if (teaseTimerRef.current) {
        window.clearInterval(teaseTimerRef.current);
        teaseTimerRef.current = null;
      }
      if (result) {
        saveRecentId(result.id);
        setResultName(result.name);
        setPicked(result);
      } else {
        setResultName('후보 없음');
      }
      setPhase('drop');
    }, GACHA_TIMINGS.crankMs + GACHA_TIMINGS.spinMs);

    schedule(() => setPhase('reveal'), GACHA_TIMINGS.crankMs + GACHA_TIMINGS.spinMs + GACHA_TIMINGS.dropMs);

    schedule(() => {
      setShowCard(true);
      setPhase('idle');
    }, GACHA_TIMINGS.crankMs +
      GACHA_TIMINGS.spinMs +
      GACHA_TIMINGS.dropMs +
      GACHA_TIMINGS.revealMs +
      GACHA_TIMINGS.cardMs);
  }, [pool, playing, clearTimers, schedule, randomName]);

  return (
    <section className="rounded-2xl border-2 border-violet-200/80 bg-gradient-to-br from-slate-900 via-violet-950/20 to-fuchsia-950/10 p-5 sm:p-8 shadow-xl shadow-violet-200/30">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-400">LUCKY LUNCH</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white">점심 가챠머신 🎰</h2>
        <p className="mt-2 text-sm text-violet-200/70">오락실 캡슐 한 방 — 오늘 점심이 나와요</p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={playing}
          onClick={() => setCategory('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
            category === 'all'
              ? 'bg-violet-500 text-white border-violet-400'
              : 'bg-white/10 text-violet-100 border-violet-400/30 hover:bg-white/15'
          }`}
        >
          전체
        </button>
        {LUNCH_CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            disabled={playing}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
              category === cat
                ? 'bg-violet-500 text-white border-violet-400'
                : 'bg-white/10 text-violet-100 border-violet-400/30 hover:bg-white/15'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-violet-300/60">오늘·어제 먹은 곳은 뽑기에서 제외</p>

      <LunchGachaMachine phase={phase} resultName={resultName} teaseName={teaseName} />

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleDraw}
          disabled={pool.length === 0 || playing}
          className="px-10 py-4 text-lg font-black rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-300/40 hover:from-violet-700 hover:to-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          {playing ? '뽑는 중…' : '🎰 레버 당기기!'}
        </button>
        <p className="text-xs text-violet-300/50">후보 {pool.length}곳</p>
      </div>

      {showCard && picked && (
        <div className="mt-8 lunch-reveal-slide">
          <p className="mb-3 text-center text-base font-black text-violet-700">🎉 오늘의 점심</p>
          <LunchSpotCard
            spot={picked}
            journal={journal[picked.id] ?? null}
            onRecordVisit={onRecordVisit}
            onEditVisit={onEditVisit}
            onDeleteVisit={onDeleteVisit}
            onCancelToday={onCancelToday}
            showVisitForm
            highlight
          />
        </div>
      )}

      {pool.length === 0 && (
        <p className="mt-4 text-center text-sm text-red-600">
          뽑을 맛집이 없습니다. (오늘·어제 다 먹었거나 필터 결과 없음)
        </p>
      )}
    </section>
  );
}
