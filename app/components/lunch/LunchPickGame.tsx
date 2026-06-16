'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LunchSpot } from '@/app/types/lunch';
import { getRecentEatenSpotIds } from '@/app/utils/lunchJournal';
import {
  buildWalkDistanceBands,
  filterSpotsByDistanceBand,
  type WalkDistanceBand,
} from '@/app/utils/lunchDistance';
import {
  loadRecentIds,
  pickLunchSpot,
  saveRecentId,
} from '@/app/utils/lunchPick';
import type { LunchJournalStore } from '@/app/types/lunchJournal';
import type { KickSide } from './penaltyScene';
import LunchSpotCard from './LunchSpotCard';
import LunchGachaMachine from './LunchGachaMachine';
import type { GachaBall } from './gachaBalls';
import LunchPenaltyField from './LunchPenaltyField';
import LunchPenaltySetup, {
  buildOutcomeMap,
  pickRandomPair,
  type PenaltyOutcomeMap,
} from './LunchPenaltySetup';
import { GACHA_TIMINGS, type GachaPhase } from './gachaTimings';
import { PENALTY_TIMINGS, type PenaltyPhase } from './LunchPenaltyField';

type PickMode = 'gacha' | 'penalty';

type GachaStep = 'idle' | 'done';
type PenaltyStep = 'idle' | 'setup' | 'playing' | 'done';

interface LunchPickGameProps {
  spots: LunchSpot[];
  journal: LunchJournalStore;
  authorName?: string;
  onRecordVisit: (spotId: string, rating: number, review: string) => void;
  onEditVisit: (spotId: string, visitId: string, rating: number, review: string) => void;
  onDeleteVisit: (spotId: string, visitId: string) => void;
  onCancelToday: (spotId: string) => void;
}

const MIN_HOLD_MS = 450;

/** pool 식당마다 01~N 번호 + 색상 */
function assignSpotBallNumbers(spots: LunchSpot[]) {
  const map = new Map<string, { num: string; colorIndex: number }>();
  spots.forEach((spot, i) => {
    const digits = Math.max(2, String(spots.length).length);
    map.set(spot.id, {
      num: String(i + 1).padStart(digits, '0'),
      colorIndex: i % 16,
    });
  });
  return map;
}

function gkSideForOutcome(kickSide: KickSide, scored: boolean): KickSide {
  if (scored) {
    return kickSide === 'left' ? 'right' : kickSide === 'right' ? 'left' : 'center';
  }
  return kickSide;
}

export default function LunchPickGame({
  spots,
  journal,
  authorName = '',
  onRecordVisit,
  onEditVisit,
  onDeleteVisit,
  onCancelToday,
}: LunchPickGameProps) {
  const [mode, setMode] = useState<PickMode>('gacha');
  const [distanceBand, setDistanceBand] = useState<string | 'all'>('all');

  const [gachaStep, setGachaStep] = useState<GachaStep>('idle');
  const [gachaPhase, setGachaPhase] = useState<GachaPhase>('idle');
  const [leverHeld, setLeverHeld] = useState(false);
  const [teaseName, setTeaseName] = useState('');
  const [resultName, setResultName] = useState('');
  const [winSpotId, setWinSpotId] = useState<string | null>(null);

  const [penaltyStep, setPenaltyStep] = useState<PenaltyStep>('idle');
  const [penaltyPhase, setPenaltyPhase] = useState<PenaltyPhase>('idle');
  const [slotAId, setSlotAId] = useState('');
  const [slotBId, setSlotBId] = useState('');
  const [goalSpotId, setGoalSpotId] = useState('');
  const [outcomes, setOutcomes] = useState<PenaltyOutcomeMap | null>(null);
  const [kickSide, setKickSide] = useState<KickSide>('left');
  const [gkSide, setGkSide] = useState<KickSide>('center');
  const [penaltyScored, setPenaltyScored] = useState(false);

  const [picked, setPicked] = useState<LunchSpot | null>(null);
  const [showCard, setShowCard] = useState(false);

  const timersRef = useRef<number[]>([]);
  const teaseTimerRef = useRef<number | null>(null);
  const crankTimerRef = useRef<number | null>(null);
  const leverHeldRef = useRef(false);
  const holdStartRef = useRef<number>(0);

  useEffect(() => {
    leverHeldRef.current = leverHeld;
  }, [leverHeld]);

  const bands = useMemo(() => buildWalkDistanceBands(spots, 4), [spots]);

  const pool = useMemo(() => {
    let list = filterSpotsByDistanceBand(spots, distanceBand, bands);
    const eaten = new Set(getRecentEatenSpotIds(journal, authorName || '익명'));
    const filtered = list.filter(s => !eaten.has(s.id));
    if (filtered.length > 0) list = filtered;
    return list;
  }, [spots, distanceBand, bands, journal, authorName]);

  const gachaBusy = gachaPhase !== 'idle' || leverHeld;
  const penaltyBusy = penaltyStep === 'setup' || penaltyStep === 'playing';
  const playing = mode === 'gacha' ? gachaBusy : penaltyBusy;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current = [];
    if (crankTimerRef.current !== null) {
      window.clearTimeout(crankTimerRef.current);
      crankTimerRef.current = null;
    }
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

  const spotBallMap = useMemo(() => assignSpotBallNumbers(pool), [pool]);

  const gachaBalls = useMemo<GachaBall[]>(
    () => pool.map(spot => {
      const ball = spotBallMap.get(spot.id)!;
      return { spotId: spot.id, num: ball.num, colorIndex: ball.colorIndex };
    }),
    [pool, spotBallMap],
  );

  const resetAll = useCallback(() => {
    clearTimers();
    setGachaStep('idle');
    setGachaPhase('idle');
    setLeverHeld(false);
    setTeaseName('');
    setResultName('');
    setWinSpotId(null);
    setPenaltyStep('idle');
    setPenaltyPhase('idle');
    setSlotAId('');
    setSlotBId('');
    setGoalSpotId('');
    setOutcomes(null);
    setPicked(null);
    setShowCard(false);
  }, [clearTimers]);

  const switchMode = (next: PickMode) => {
    if (playing) return;
    setMode(next);
    resetAll();
  };

  const revealGachaWinner = useCallback((winner: LunchSpot) => {
    setPicked(winner);
    saveRecentId(winner.id);
    setResultName(winner.name);
    setWinSpotId(winner.id);
    setGachaPhase('drop');
    schedule(() => setGachaPhase('reveal'), GACHA_TIMINGS.dropMs);
    schedule(() => {
      setShowCard(true);
      setGachaPhase('idle');
      setGachaStep('done');
    }, GACHA_TIMINGS.dropMs + GACHA_TIMINGS.revealMs + GACHA_TIMINGS.cardMs);
  }, [schedule]);

  const finishPenalty = useCallback(() => {
    setShowCard(true);
    setPenaltyStep('done');
    setPenaltyPhase('idle');
  }, []);

  const startTease = useCallback(() => {
    if (!leverHeldRef.current) return;
    setGachaPhase('spin');
    setTeaseName(randomName());
    if (teaseTimerRef.current) window.clearInterval(teaseTimerRef.current);
    teaseTimerRef.current = window.setInterval(() => setTeaseName(randomName()), 100);
  }, [randomName]);

  const cancelCrank = useCallback(() => {
    if (crankTimerRef.current !== null) {
      window.clearTimeout(crankTimerRef.current);
      crankTimerRef.current = null;
    }
    if (teaseTimerRef.current) {
      window.clearInterval(teaseTimerRef.current);
      teaseTimerRef.current = null;
    }
  }, []);

  const handleLeverDown = useCallback(() => {
    if (mode !== 'gacha' || pool.length === 0 || (gachaBusy && !leverHeld)) return;
    if (gachaStep !== 'idle' || gachaPhase !== 'idle') return;

    cancelCrank();
    holdStartRef.current = Date.now();
    setLeverHeld(true);
    setShowCard(false);
    setPicked(null);
    setGachaPhase('crank');
    crankTimerRef.current = window.setTimeout(() => {
      crankTimerRef.current = null;
      startTease();
    }, 180);
  }, [mode, pool.length, gachaBusy, leverHeld, gachaStep, gachaPhase, cancelCrank, startTease]);

  const handleLeverUp = useCallback(() => {
    if (mode !== 'gacha' || !leverHeld) return;
    setLeverHeld(false);
    cancelCrank();

    const heldMs = Date.now() - holdStartRef.current;
    if (heldMs < MIN_HOLD_MS || pool.length === 0) {
      setGachaPhase('idle');
      setTeaseName('');
      return;
    }

    const recent = loadRecentIds();
    const result = pickLunchSpot(pool, { excludeIds: recent });
    if (!result) {
      setGachaPhase('idle');
      setTeaseName('');
      return;
    }

    setTeaseName('');
    revealGachaWinner(result);
  }, [mode, leverHeld, pool, revealGachaWinner, cancelCrank]);

  const syncOutcomes = useCallback(
    (aId: string, bId: string, goalId: string) => {
      if (!aId || !bId || aId === bId || !goalId) {
        setOutcomes(null);
        return;
      }
      const a = pool.find(s => s.id === aId);
      const b = pool.find(s => s.id === bId);
      if (!a || !b) {
        setOutcomes(null);
        return;
      }
      const goalSpot = goalId === aId ? a : goalId === bId ? b : null;
      if (!goalSpot) {
        setOutcomes(null);
        return;
      }
      const missSpot = goalSpot.id === aId ? b : a;
      setOutcomes(buildOutcomeMap(goalSpot, missSpot));
    },
    [pool],
  );

  useEffect(() => {
    syncOutcomes(slotAId, slotBId, goalSpotId);
  }, [slotAId, slotBId, goalSpotId, syncOutcomes]);

  const handleSlotAChange = useCallback((id: string) => {
    setSlotAId(id);
    if (id && !goalSpotId) setGoalSpotId(id);
  }, [goalSpotId]);

  const handleSlotBChange = useCallback((id: string) => {
    setSlotBId(id);
    if (id && slotAId && !goalSpotId) setGoalSpotId(slotAId);
  }, [slotAId, goalSpotId]);

  const handleAssignGoal = useCallback((spotId: string) => {
    setGoalSpotId(spotId);
  }, []);

  const fillRandomPair = useCallback(() => {
    const pair = pickRandomPair(pool);
    if (!pair) return;
    const [a, b] = pair;
    setSlotAId(a);
    setSlotBId(b);
    setGoalSpotId(a);
  }, [pool]);

  const startPenalty = useCallback(() => {
    if (pool.length === 0 || penaltyBusy) return;
    setShowCard(false);
    setPicked(null);
    setSlotAId('');
    setSlotBId('');
    setGoalSpotId('');
    setOutcomes(null);
    setPenaltyStep('setup');
  }, [pool, penaltyBusy]);

  const runPenaltyKick = useCallback(
    (side: KickSide) => {
      if (!outcomes || penaltyStep !== 'setup') return;

      const scored = Math.random() < 0.5;
      const winner = scored ? outcomes.goalSpot : outcomes.missSpot;
      const gk = gkSideForOutcome(side, scored);

      setKickSide(side);
      setGkSide(gk);
      setPenaltyScored(scored);
      setPicked(winner);
      saveRecentId(winner.id);
      setPenaltyStep('playing');
      setPenaltyPhase('ready');

      schedule(() => setPenaltyPhase('kick'), PENALTY_TIMINGS.readyMs);
      schedule(() => setPenaltyPhase('goal'), PENALTY_TIMINGS.readyMs + PENALTY_TIMINGS.kickMs);
      schedule(
        () => setPenaltyPhase('celebrate'),
        PENALTY_TIMINGS.readyMs + PENALTY_TIMINGS.kickMs + PENALTY_TIMINGS.goalFlashMs,
      );
      schedule(
        () => finishPenalty(),
        PENALTY_TIMINGS.readyMs + PENALTY_TIMINGS.kickMs + PENALTY_TIMINGS.goalFlashMs + PENALTY_TIMINGS.celebrateMs,
      );
    },
    [outcomes, penaltyStep, schedule, finishPenalty],
  );

  const showGachaMachine = mode === 'gacha';
  const showPenaltyField = mode === 'penalty' && penaltyStep === 'playing' && picked;
  const showGachaCapsule = mode === 'gacha' && (gachaPhase === 'drop' || gachaPhase === 'reveal');

  return (
    <section className="rounded-2xl border-2 border-violet-200/80 bg-gradient-to-br from-slate-900 via-violet-950/20 to-fuchsia-950/10 p-5 sm:p-8 shadow-xl shadow-violet-200/30">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-400">LUCKY LUNCH</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white">점심 뽑기</h2>
        <p className="mt-2 text-sm text-violet-200/70">
          {mode === 'gacha' ? '가챠머신으로 한 방에!' : '승부차기로 운명을 가르자!'}
        </p>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        <button
          type="button"
          disabled={playing}
          onClick={() => switchMode('gacha')}
          className={`px-5 py-2.5 text-sm font-black rounded-xl border transition-all disabled:opacity-50 ${
            mode === 'gacha'
              ? 'bg-violet-500 text-white border-violet-400 shadow-lg shadow-violet-500/30'
              : 'bg-white/10 text-violet-100 border-violet-400/30 hover:bg-white/15'
          }`}
        >
          🎰 가챠
        </button>
        <button
          type="button"
          disabled={playing}
          onClick={() => switchMode('penalty')}
          className={`px-5 py-2.5 text-sm font-black rounded-xl border transition-all disabled:opacity-50 ${
            mode === 'penalty'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/30'
              : 'bg-white/10 text-emerald-100 border-emerald-400/30 hover:bg-white/15'
          }`}
        >
          ⚽ 승부차기
        </button>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={playing}
          onClick={() => { setDistanceBand('all'); resetAll(); }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
            distanceBand === 'all'
              ? 'bg-violet-500 text-white border-violet-400'
              : 'bg-white/10 text-violet-100 border-violet-400/30 hover:bg-white/15'
          }`}
        >
          전체
        </button>
        {bands.map((band: WalkDistanceBand) => (
          <button
            key={band.id}
            type="button"
            disabled={playing}
            onClick={() => { setDistanceBand(band.id); resetAll(); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
              distanceBand === band.id
                ? 'bg-violet-500 text-white border-violet-400'
                : 'bg-white/10 text-violet-100 border-violet-400/30 hover:bg-white/15'
            }`}
            title={band.label}
          >
            {band.emoji} {band.shortLabel}
          </button>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-violet-300/60">
        {distanceBand === 'all'
          ? `전체 ${pool.length}곳 · 공 ${pool.length}개 · 내가 오늘·어제 먹은 곳 제외`
          : `${bands.find(b => b.id === distanceBand)?.label ?? ''} · 추첨 ${pool.length}곳 · 공 ${pool.length}개`}
      </p>

      {showGachaMachine && (
        <>
          <LunchGachaMachine
            phase={gachaPhase}
            balls={gachaBalls}
            winSpotId={showGachaCapsule ? (winSpotId ?? undefined) : undefined}
            resultName={showGachaCapsule ? resultName : undefined}
            teaseName={teaseName}
            leverHeld={leverHeld}
            onLeverDown={handleLeverDown}
            onLeverUp={handleLeverUp}
            disabled={pool.length === 0 || gachaStep === 'done'}
          />
          {gachaStep === 'idle' && gachaPhase === 'idle' && !leverHeld && pool.length > 0 && (
            <p className="mt-4 text-center text-sm font-bold text-amber-300/90 animate-pulse">
              👉 옆 레버를 당기면 공이 섞이고, 놓으면 당첨!
            </p>
          )}
        </>
      )}

      {mode === 'penalty' && penaltyStep === 'idle' && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={pool.length === 0}
            onClick={startPenalty}
            className="px-10 py-4 text-lg font-black rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 active:scale-95"
          >
            ⚽ 승부차기 시작
          </button>
          <p className="text-xs text-emerald-200/60">가게 2곳 직접 선택 · 골/막힘 지정 · 50% 확률</p>
        </div>
      )}

      {mode === 'penalty' && penaltyStep === 'setup' && (
        <LunchPenaltySetup
          pool={pool}
          slotAId={slotAId}
          slotBId={slotBId}
          goalSpotId={goalSpotId}
          onSlotAChange={handleSlotAChange}
          onSlotBChange={handleSlotBChange}
          onAssignGoal={handleAssignGoal}
          onRandomPair={fillRandomPair}
          onKick={runPenaltyKick}
        />
      )}

      {showPenaltyField && picked && (
        <LunchPenaltyField
          phase={penaltyPhase}
          targetName={picked.name}
          hintName={penaltyScored ? outcomes?.goalSpot.name : outcomes?.missSpot.name}
          kickSide={kickSide}
          gkSide={gkSide}
          saved={!penaltyScored}
        />
      )}

      {(gachaStep === 'done' || penaltyStep === 'done') && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={resetAll}
            className="text-xs font-semibold text-violet-300 hover:text-white underline"
          >
            다시 뽑기
          </button>
        </div>
      )}

      {showCard && picked && (
        <div className="mt-8 lunch-reveal-slide">
          <p className="mb-3 text-center text-base font-black text-violet-700">🎉 오늘의 점심</p>
          <LunchSpotCard
            spot={picked}
            journal={journal[picked.id] ?? null}
            currentAuthor={authorName}
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
        <p className="mt-4 text-center text-sm text-red-400">
          뽑을 맛집이 없습니다. (내가 오늘·어제 다 먹었거나 필터 결과 없음)
        </p>
      )}
    </section>
  );
}
