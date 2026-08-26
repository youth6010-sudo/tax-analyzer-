'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import { MANAGER_DISPLAY_ORDER } from '@/app/utils/clientsGrouping';
import LunchGachaMachine from '@/app/components/lunch/LunchGachaMachine';
import type { GachaBall } from '@/app/components/lunch/gachaBalls';
import { GACHA_TIMINGS, type GachaPhase } from '@/app/components/lunch/gachaTimings';
import LunchPenaltyField, {
  PENALTY_TIMINGS,
  type PenaltyPhase,
} from '@/app/components/lunch/LunchPenaltyField';
import type { KickSide } from '@/app/components/lunch/penaltyScene';
import { MANAGER_GACHA_THEME } from '@/app/components/gacha/gachaThemes';
import ManagerLadderBoard from '@/app/components/gacha/ManagerLadderBoard';
import {
  buildLadderBoard,
  resolveLadderWinner,
  type LadderBoard,
} from '@/app/components/gacha/managerLadder';
import type { PresenceStaffDto } from '@/lib/presence';

const POOL_STORAGE_KEY = 'manager-gacha-pool-v1';
const MIN_HOLD_MS = 450;

type PickMode = 'gacha' | 'penalty' | 'ladder';
type GachaStep = 'idle' | 'done';
/** idle → match(대진 대기) → playing(슛 연출) → match… → done */
type PenaltyStep = 'idle' | 'match' | 'playing' | 'done';
type LadderStep = 'idle' | 'ready' | 'running' | 'done';
type EntityKind = 'individual' | 'corporate';

function gkSideForOutcome(kickSide: KickSide, scored: boolean): KickSide {
  if (scored) {
    return kickSide === 'left' ? 'right' : kickSide === 'right' ? 'left' : 'center';
  }
  return kickSide;
}

function shuffleNames(names: string[]): string[] {
  const a = [...names];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}
const MANAGER_ACCENT: Record<string, string> = {
  블루: 'from-sky-100 to-blue-100 ring-sky-200 text-sky-900',
  다야: 'from-rose-100 to-pink-100 ring-rose-200 text-rose-900',
  윈터: 'from-cyan-100 to-teal-100 ring-cyan-200 text-teal-900',
  리아: 'from-fuchsia-100 to-purple-100 ring-fuchsia-200 text-fuchsia-900',
  페리: 'from-amber-100 to-orange-100 ring-amber-200 text-amber-900',
  인디: 'from-emerald-100 to-green-100 ring-emerald-200 text-emerald-900',
  찰리: 'from-indigo-100 to-indigo-100 ring-indigo-200 text-indigo-900',
};

function loadSavedPool(): string[] {
  if (typeof window === 'undefined') return [...MANAGER_DISPLAY_ORDER];
  try {
    const raw = localStorage.getItem(POOL_STORAGE_KEY);
    if (!raw) return [...MANAGER_DISPLAY_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...MANAGER_DISPLAY_ORDER];
    const valid = parsed.filter(
      (m): m is string => typeof m === 'string' && MANAGER_DISPLAY_ORDER.includes(m),
    );
    return valid.length > 0 ? valid : [...MANAGER_DISPLAY_ORDER];
  } catch {
    return [...MANAGER_DISPLAY_ORDER];
  }
}

function savePool(pool: string[]) {
  try {
    localStorage.setItem(POOL_STORAGE_KEY, JSON.stringify(pool));
  } catch {
    /* ignore */
  }
}

function pickRandomManager(pool: string[]): string | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function compareManagers(a: string, b: string): number {
  const ia = MANAGER_DISPLAY_ORDER.indexOf(a);
  const ib = MANAGER_DISPLAY_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, 'ko');
}

export default function ManagerGachaGame() {
  const router = useRouter();
  const [mode, setMode] = useState<PickMode>('gacha');
  const [selected, setSelected] = useState<string[]>(() => [...MANAGER_DISPLAY_ORDER]);
  const [hydrated, setHydrated] = useState(false);

  const [gachaStep, setGachaStep] = useState<GachaStep>('idle');
  const [gachaPhase, setGachaPhase] = useState<GachaPhase>('idle');
  const [leverHeld, setLeverHeld] = useState(false);
  const [teaseName, setTeaseName] = useState('');
  const [resultName, setResultName] = useState('');
  const [winManager, setWinManager] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [entity, setEntity] = useState<EntityKind>('individual');
  const [staff, setStaff] = useState<PresenceStaffDto[]>([]);
  const [penaltyStep, setPenaltyStep] = useState<PenaltyStep>('idle');
  const [penaltyPhase, setPenaltyPhase] = useState<PenaltyPhase>('idle');
  const [matchA, setMatchA] = useState('');
  const [matchB, setMatchB] = useState('');
  const [challengerQueue, setChallengerQueue] = useState<string[]>([]);
  const [goalName, setGoalName] = useState('');
  const [matchRound, setMatchRound] = useState(1);
  const [kickSide, setKickSide] = useState<KickSide>('left');
  const [gkSide, setGkSide] = useState<KickSide>('right');
  const [penaltyScored, setPenaltyScored] = useState(false);
  const [animTarget, setAnimTarget] = useState<string | null>(null);
  const [ladderStep, setLadderStep] = useState<LadderStep>('idle');
  const [ladderBoard, setLadderBoard] = useState<LadderBoard | null>(null);
  const [ladderPathCols, setLadderPathCols] = useState<number[] | null>(null);
  const [ladderProgress, setLadderProgress] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const timersRef = useRef<number[]>([]);
  const teaseTimerRef = useRef<number | null>(null);
  const crankTimerRef = useRef<number | null>(null);
  const leverHeldRef = useRef(false);
  const holdStartRef = useRef<number>(0);

  useEffect(() => {
    setSelected(loadSavedPool());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) savePool(selected);
  }, [selected, hydrated]);

  useEffect(() => {
    leverHeldRef.current = leverHeld;
  }, [leverHeld]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/presence', { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { staff?: PresenceStaffDto[] };
        if (!cancelled) setStaff(Array.isArray(data.staff) ? data.staff : []);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const pool = useMemo(() => selected.slice().sort((a, b) => compareManagers(a, b)), [selected]);

  const shootoutPool = useMemo(() => {
    const names = staff
      .filter(s => (entity === 'corporate' ? s.acceptCorporate : s.acceptIndividual))
      .map(s => s.name)
      .filter(n => MANAGER_DISPLAY_ORDER.includes(n) || !!STAFF_REAL_NAMES[n]);
    const unique = [...new Set(names)];
    return unique.sort(compareManagers);
  }, [staff, entity]);

  const gachaBusy = gachaPhase !== 'idle' || leverHeld;
  const penaltyBusy = penaltyStep === 'match' || penaltyStep === 'playing';
  const ladderBusy = ladderStep === 'running';
  const playing =
    mode === 'gacha'
      ? gachaBusy
      : mode === 'penalty'
        ? penaltyBusy || creating
        : ladderBusy || creating;

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
    () => pool[Math.floor(Math.random() * pool.length)] ?? '',
    [pool],
  );

  const gachaBalls = useMemo<GachaBall[]>(
    () =>
      pool.map((manager, i) => ({
        spotId: manager,
        num: String(i + 1).padStart(Math.max(2, String(pool.length).length), '0'),
        colorIndex:
          MANAGER_DISPLAY_ORDER.indexOf(manager) >= 0
            ? MANAGER_DISPLAY_ORDER.indexOf(manager)
            : i,
      })),
    [pool],
  );

  const resetGacha = useCallback(() => {
    clearTimers();
    setGachaStep('idle');
    setGachaPhase('idle');
    setLeverHeld(false);
    setTeaseName('');
    setResultName('');
    setWinManager(null);
    setShowResult(false);
  }, [clearTimers]);

  const resetPenalty = useCallback(() => {
    clearTimers();
    setPenaltyStep('idle');
    setPenaltyPhase('idle');
    setMatchA('');
    setMatchB('');
    setChallengerQueue([]);
    setGoalName('');
    setMatchRound(1);
    setKickSide('left');
    setGkSide('right');
    setPenaltyScored(false);
    setAnimTarget(null);
    setWinManager(null);
    setShowResult(false);
    setCreateError(null);
    setCreatedClientId(null);
  }, [clearTimers]);

  const resetLadder = useCallback(() => {
    clearTimers();
    setLadderStep('idle');
    setLadderBoard(null);
    setLadderPathCols(null);
    setLadderProgress(0);
    setWinManager(null);
    setShowResult(false);
    setCreateError(null);
    setCreatedClientId(null);
  }, [clearTimers]);

  const resetAll = useCallback(() => {
    resetGacha();
    resetPenalty();
    resetLadder();
  }, [resetGacha, resetPenalty, resetLadder]);

  const switchMode = (next: PickMode) => {
    if (playing) return;
    resetAll();
    setMode(next);
  };

  const toggleManager = (manager: string) => {
    if (playing || mode !== 'gacha') return;
    resetGacha();
    setSelected(prev => {
      const has = prev.includes(manager);
      if (has) {
        const next = prev.filter(m => m !== manager);
        return next.length > 0 ? next : prev;
      }
      return [...prev, manager].sort((a, b) => compareManagers(a, b));
    });
  };

  const selectAll = () => {
    if (playing || mode !== 'gacha') return;
    resetGacha();
    setSelected([...MANAGER_DISPLAY_ORDER]);
  };

  const revealGachaWinner = useCallback(
    (manager: string) => {
      setWinManager(manager);
      setResultName(manager);
      setGachaPhase('drop');
      schedule(() => setGachaPhase('reveal'), GACHA_TIMINGS.dropMs);
      schedule(() => {
        setShowResult(true);
        setGachaPhase('idle');
        setGachaStep('done');
      }, GACHA_TIMINGS.dropMs + GACHA_TIMINGS.revealMs + GACHA_TIMINGS.cardMs);
    },
    [schedule],
  );

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
    if (mode !== 'gacha') return;
    if (pool.length === 0 || (gachaBusy && !leverHeld)) return;
    if (gachaStep !== 'idle' || gachaPhase !== 'idle') return;

    cancelCrank();
    holdStartRef.current = Date.now();
    setLeverHeld(true);
    setShowResult(false);
    setWinManager(null);
    setGachaPhase('crank');
    crankTimerRef.current = window.setTimeout(() => {
      crankTimerRef.current = null;
      startTease();
    }, 180);
  }, [
    mode,
    pool.length,
    gachaBusy,
    leverHeld,
    gachaStep,
    gachaPhase,
    cancelCrank,
    startTease,
  ]);

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

    const winner = pickRandomManager(pool);
    if (!winner) {
      setGachaPhase('idle');
      setTeaseName('');
      return;
    }

    setTeaseName('');
    revealGachaWinner(winner);
  }, [mode, leverHeld, pool, revealGachaWinner, cancelCrank]);

  const finishTournament = useCallback((winner: string) => {
    setWinManager(winner);
    setShowResult(true);
    setPenaltyStep('done');
    setPenaltyPhase('idle');
    setAnimTarget(null);
    setMatchA('');
    setMatchB('');
    setChallengerQueue([]);
  }, []);

  const prepareLadder = useCallback(() => {
    if (shootoutPool.length < 1 || !companyName.trim() || ladderBusy) return;
    const board = buildLadderBoard(shootoutPool);
    if (!board) return;
    setShowResult(false);
    setWinManager(null);
    setCreateError(null);
    setCreatedClientId(null);
    setLadderPathCols(null);
    setLadderProgress(0);
    setLadderBoard(board);
    setLadderStep('ready');
  }, [shootoutPool, companyName, ladderBusy]);

  const runLadder = useCallback(() => {
    if (!ladderBoard || ladderStep !== 'ready') return;
    const { name, columns } = resolveLadderWinner(ladderBoard);
    setLadderPathCols(columns);
    setLadderProgress(0);
    setLadderStep('running');

    const steps = 48;
    const stepMs = 55;
    for (let i = 1; i <= steps; i += 1) {
      schedule(() => setLadderProgress(i / steps), i * stepMs);
    }
    schedule(() => {
      setWinManager(name);
      setShowResult(true);
      setLadderStep('done');
      setLadderProgress(1);
    }, steps * stepMs + 350);
  }, [ladderBoard, ladderStep, schedule]);

  const startTournament = useCallback(() => {
    if (shootoutPool.length < 2 || !companyName.trim() || penaltyBusy) return;
    const shuffled = shuffleNames(shootoutPool);
    const a = shuffled[0]!;
    const b = shuffled[1]!;
    const rest = shuffled.slice(2);
    setShowResult(false);
    setWinManager(null);
    setCreateError(null);
    setCreatedClientId(null);
    setAnimTarget(null);
    setPenaltyPhase('idle');
    setMatchA(a);
    setMatchB(b);
    setChallengerQueue(rest);
    setGoalName(Math.random() < 0.5 ? a : b);
    setMatchRound(1);
    setPenaltyStep('match');
  }, [shootoutPool, companyName, penaltyBusy]);

  const runPenaltyKick = useCallback(
    (side: KickSide) => {
      if (penaltyStep !== 'match' || !matchA || !matchB || !goalName) return;
      const missName = goalName === matchA ? matchB : matchA;
      const queueSnapshot = [...challengerQueue];
      const scored = Math.random() < 0.5;
      const winner = scored ? goalName : missName;
      const gk = gkSideForOutcome(side, scored);

      setKickSide(side);
      setGkSide(gk);
      setPenaltyScored(scored);
      setAnimTarget(winner);
      setPenaltyStep('playing');
      setPenaltyPhase('ready');

      const celebrateAt =
        PENALTY_TIMINGS.readyMs + PENALTY_TIMINGS.kickMs + PENALTY_TIMINGS.goalFlashMs;
      const doneAt = celebrateAt + PENALTY_TIMINGS.celebrateMs;

      schedule(() => setPenaltyPhase('kick'), PENALTY_TIMINGS.readyMs);
      schedule(() => setPenaltyPhase('goal'), PENALTY_TIMINGS.readyMs + PENALTY_TIMINGS.kickMs);
      schedule(() => setPenaltyPhase('celebrate'), celebrateAt);
      schedule(() => {
        if (queueSnapshot.length === 0) {
          finishTournament(winner);
          return;
        }
        const next = queueSnapshot[0]!;
        const rest = queueSnapshot.slice(1);
        setMatchA(winner);
        setMatchB(next);
        setChallengerQueue(rest);
        setGoalName(Math.random() < 0.5 ? winner : next);
        setMatchRound(r => r + 1);
        setAnimTarget(null);
        setPenaltyPhase('idle');
        setPenaltyStep('match');
      }, doneAt);
    },
    [
      penaltyStep,
      matchA,
      matchB,
      goalName,
      challengerQueue,
      schedule,
      finishTournament,
    ],
  );

  const createClient = useCallback(async () => {
    if (!winManager || !companyName.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/clients/from-shootout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          companyName: companyName.trim(),
          manager: winManager,
          entity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data.error === 'string' ? data.error : '생성 실패');
        return;
      }
      const id = data?.client?.id as string | undefined;
      if (id) {
        setCreatedClientId(id);
        router.push(`/clients/${id}`);
      }
    } catch {
      setCreateError('네트워크 오류');
    } finally {
      setCreating(false);
    }
  }, [winManager, companyName, entity, creating, router]);

  const showGachaCapsule = mode === 'gacha' && (gachaPhase === 'drop' || gachaPhase === 'reveal');
  const showPenaltyField = mode === 'penalty' && penaltyStep === 'playing' && !!animTarget;
  const realName = winManager ? STAFF_REAL_NAMES[winManager] : undefined;
  const canStartShootout =
    companyName.trim().length > 0 && shootoutPool.length >= 2 && penaltyStep === 'idle';
  const canStartLadder =
    companyName.trim().length > 0 && shootoutPool.length >= 1 && ladderStep === 'idle';
  const missHint = goalName === matchA ? matchB : matchA;
  const stillIn = [matchA, matchB, ...challengerQueue].filter(Boolean);
  const needsAcceptPool = mode === 'penalty' || mode === 'ladder';
  const assignModeDone =
    (mode === 'penalty' && penaltyStep === 'done') ||
    (mode === 'ladder' && ladderStep === 'done');

  return (
    <section className="rounded-2xl border border-indigo-300/40 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-blue-950/15 p-5 sm:p-8 shadow-xl shadow-indigo-900/10 ring-1 ring-white/5">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-400">STAFF PICK</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">담당자 뽑기</h2>
        <p className="mt-2 text-sm text-indigo-100/90 leading-relaxed">
          {mode === 'gacha'
            ? '후보를 고르고 가챠머신으로 한 명을 뽑아요'
            : mode === 'penalty'
              ? '수임가능 ON 전원이 토너먼트 승부차기 · 최후 1명이 담당'
              : '수임가능 ON 인원이 사다리 · 상호에 걸린 사람이 담당'}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={playing}
          onClick={() => switchMode('gacha')}
          className={`px-5 py-2.5 text-sm font-black rounded-xl border transition-all disabled:opacity-50 ${
            mode === 'gacha'
              ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/30'
              : 'bg-white/5 text-indigo-200 border-white/10 hover:bg-white/10'
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
              ? 'bg-teal-500 text-white border-teal-400 shadow-lg shadow-teal-500/30'
              : 'bg-white/5 text-indigo-200 border-white/10 hover:bg-white/10'
          }`}
        >
          ⚽ 승부차기
        </button>
        <button
          type="button"
          disabled={playing}
          onClick={() => switchMode('ladder')}
          className={`px-5 py-2.5 text-sm font-black rounded-xl border transition-all disabled:opacity-50 ${
            mode === 'ladder'
              ? 'bg-violet-500 text-white border-violet-400 shadow-lg shadow-violet-500/30'
              : 'bg-white/5 text-indigo-200 border-white/10 hover:bg-white/10'
          }`}
        >
          🪜 사다리
        </button>
      </div>

      {mode === 'gacha' && (
        <>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-indigo-100/90">뽑기 후보 ({pool.length}명)</p>
              <button
                type="button"
                disabled={playing}
                onClick={selectAll}
                className="text-[11px] font-semibold text-indigo-300 hover:text-white disabled:opacity-50"
              >
                전체 선택
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {MANAGER_DISPLAY_ORDER.map(manager => {
                const checked = selected.includes(manager);
                const real = STAFF_REAL_NAMES[manager];
                return (
                  <button
                    key={manager}
                    type="button"
                    disabled={playing}
                    onClick={() => toggleManager(manager)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold transition-all disabled:opacity-50',
                      checked
                        ? 'bg-indigo-500/90 text-white border-indigo-400 shadow-md shadow-indigo-500/20'
                        : 'bg-white/5 text-indigo-200/60 border-white/10 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-4 w-4 items-center justify-center rounded text-[10px]',
                        checked ? 'bg-white/25' : 'bg-white/10',
                      ].join(' ')}
                      aria-hidden
                    >
                      {checked ? '✓' : ''}
                    </span>
                    {manager}
                    {real && real !== manager && (
                      <span
                        className={`text-[11px] font-medium ${
                          checked ? 'text-indigo-100/80' : 'text-indigo-300/50'
                        }`}
                      >
                        {real}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-center text-sm text-indigo-200/80">
            공 {pool.length}개 · 최소 1명은 선택해야 해요
          </p>

          <LunchGachaMachine
            theme={MANAGER_GACHA_THEME}
            phase={gachaPhase}
            balls={gachaBalls}
            winSpotId={showGachaCapsule ? (winManager ?? undefined) : undefined}
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

          {pool.length === 0 && (
            <p className="mt-4 text-center text-sm text-red-400">
              뽑을 담당자가 없습니다. 후보를 선택해 주세요.
            </p>
          )}
        </>
      )}

      {needsAcceptPool && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-indigo-200/80 mb-1.5">상호</label>
            <input
              type="text"
              value={companyName}
              disabled={playing || assignModeDone}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="신규 업체 상호"
              className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2.5 text-sm text-white placeholder:text-indigo-300/40 focus:outline-none focus:ring-2 focus:ring-teal-400/50 disabled:opacity-50"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-indigo-200/80 mb-1.5">유형</p>
            <div className="flex gap-2">
              {(
                [
                  { id: 'individual' as const, label: '개인' },
                  { id: 'corporate' as const, label: '법인' },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={playing || assignModeDone}
                  onClick={() => {
                    setEntity(opt.id);
                    if (mode === 'penalty' && penaltyStep === 'idle') resetPenalty();
                    if (mode === 'ladder' && ladderStep === 'idle') resetLadder();
                  }}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition-all disabled:opacity-50 ${
                    entity === opt.id
                      ? 'bg-teal-500 text-white border-teal-400'
                      : 'bg-white/5 text-indigo-200 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-indigo-200/80 mb-2">
              수임가능 ON 후보 ({shootoutPool.length}명)
            </p>
            {shootoutPool.length === 0 ? (
              <p className="text-sm text-amber-200/90">
                해당 유형 수임가능을 ON한 담당자가 없습니다.
              </p>
            ) : mode === 'penalty' && shootoutPool.length < 2 ? (
              <p className="text-sm text-amber-200/90">
                승부차기는 수임가능 ON이 2명 이상이어야 합니다. (현재 {shootoutPool.length}명)
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {shootoutPool.map(name => {
                  const alive =
                    mode !== 'penalty' ||
                    penaltyStep === 'idle' ||
                    penaltyStep === 'done' ||
                    stillIn.includes(name) ||
                    animTarget === name;
                  return (
                    <span
                      key={name}
                      className={[
                        'rounded-xl border px-3 py-1.5 text-sm font-bold transition-all',
                        alive
                          ? 'border-teal-400/50 bg-teal-500/20 text-teal-50'
                          : 'border-white/5 bg-white/5 text-indigo-100/35 line-through',
                      ].join(' ')}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'penalty' && (
        <>
          {penaltyStep === 'idle' && (
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                disabled={!canStartShootout}
                onClick={startTournament}
                className="px-10 py-4 text-lg font-black rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/30 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 active:scale-95"
              >
                ⚽ 승부차기 시작
              </button>
              <p className="text-xs text-indigo-200/70 text-center leading-relaxed">
                ON인 전원 참가 · 1:1 슛으로 탈락 · 마지막 1명 당첨
                <br />
                (예: 3명이면 2경기)
              </p>
            </div>
          )}

          {penaltyStep === 'match' && matchA && matchB && (
            <div className="mt-4 rounded-2xl border-2 border-emerald-400/50 bg-gradient-to-b from-emerald-950/40 to-slate-900/80 p-4 sm:p-5">
              <p className="text-center text-xs font-bold uppercase tracking-widest text-emerald-300/80">
                ⚽ {matchRound}라운드 · 남은 {stillIn.length}명
              </p>
              <div className="mt-4 flex items-center justify-center gap-3 sm:gap-6">
                <div className="min-w-[5.5rem] rounded-xl border border-amber-400/40 bg-amber-950/30 px-3 py-3 text-center">
                  <p className="text-[10px] font-bold text-amber-200/70">선수</p>
                  <p className="mt-1 text-lg font-black text-white">{matchA}</p>
                </div>
                <p className="text-sm font-black text-emerald-300">VS</p>
                <div className="min-w-[5.5rem] rounded-xl border border-sky-400/40 bg-sky-950/30 px-3 py-3 text-center">
                  <p className="text-[10px] font-bold text-sky-200/70">도전자</p>
                  <p className="mt-1 text-lg font-black text-white">{matchB}</p>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-emerald-100/55">
                ⚽ 골 → {goalName} · 🧤 막힘 → {missHint}
                {challengerQueue.length > 0
                  ? ` · 대기 ${challengerQueue.join(', ')}`
                  : ' · 이번이 결승'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => runPenaltyKick('left')}
                  className="py-3 text-sm font-black rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-lg hover:from-sky-500 hover:to-sky-400 active:scale-95"
                >
                  ← 왼쪽 슛
                </button>
                <button
                  type="button"
                  onClick={() => runPenaltyKick('right')}
                  className="py-3 text-sm font-black rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg hover:from-rose-500 hover:to-rose-400 active:scale-95"
                >
                  오른쪽 슛 →
                </button>
              </div>
            </div>
          )}

          {showPenaltyField && animTarget && (
            <LunchPenaltyField
              variant="staff"
              phase={penaltyPhase}
              targetName={animTarget}
              hintName={penaltyScored ? goalName : missHint}
              kickSide={kickSide}
              gkSide={gkSide}
              saved={!penaltyScored}
            />
          )}
        </>
      )}

      {mode === 'ladder' && (
        <>
          {ladderStep === 'idle' && (
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                disabled={!canStartLadder}
                onClick={prepareLadder}
                className="px-10 py-4 text-lg font-black rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 active:scale-95"
              >
                🪜 사다리 만들기
              </button>
              <p className="text-xs text-indigo-200/70 text-center leading-relaxed">
                ON 전원 상단 · 하단 한 칸에 상호 · 연결된 담당자가 당첨
              </p>
            </div>
          )}

          {ladderBoard && (ladderStep === 'ready' || ladderStep === 'running' || ladderStep === 'done') && (
            <>
              <ManagerLadderBoard
                board={ladderBoard}
                companyName={companyName}
                pathColumns={ladderPathCols}
                pathProgress={ladderProgress}
                revealed={ladderStep === 'done'}
              />
              {ladderStep === 'ready' && (
                <div className="mt-5 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={runLadder}
                    className="px-10 py-3.5 text-base font-black rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:from-amber-400 hover:to-orange-400 active:scale-95"
                  >
                    타고 내려가기
                  </button>
                  <button
                    type="button"
                    onClick={prepareLadder}
                    className="text-xs font-semibold text-violet-300 hover:text-white underline"
                  >
                    사다리 다시 섞기
                  </button>
                </div>
              )}
              {ladderStep === 'running' && (
                <p className="mt-4 text-center text-sm font-black text-amber-300 animate-pulse">
                  🪜 사다리를 타는 중…
                </p>
              )}
            </>
          )}
        </>
      )}

      {(gachaStep === 'done' || assignModeDone) && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={
              mode === 'gacha' ? resetGacha : mode === 'penalty' ? resetPenalty : resetLadder
            }
            className="text-xs font-semibold text-indigo-300 hover:text-white underline"
          >
            다시 뽑기
          </button>
        </div>
      )}

      {showResult && winManager && (
        <div className="mt-8 lunch-reveal-slide">
          <p className="mb-3 text-center text-base font-black text-indigo-300">🎉 당첨 담당자</p>
          <div
            className={[
              'mx-auto max-w-md rounded-2xl bg-gradient-to-br p-6 text-center shadow-lg ring-1',
              MANAGER_ACCENT[winManager] ?? 'from-slate-100 to-gray-100 ring-gray-200 text-gray-900',
            ].join(' ')}
          >
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/60 text-3xl font-black shadow-inner">
              {winManager.slice(0, 1)}
            </div>
            <p className="text-2xl font-black">{winManager}</p>
            {realName && realName !== winManager && (
              <p className="mt-1 text-sm font-medium opacity-70">{realName}</p>
            )}
            {needsAcceptPool && companyName.trim() && (
              <p className="mt-3 text-sm font-semibold opacity-80">
                {companyName.trim()} · {entity === 'corporate' ? '법인' : '개인'}
              </p>
            )}
          </div>

          {assignModeDone && !createdClientId && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => void createClient()}
                className="px-8 py-3 text-sm font-black rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400 disabled:opacity-50"
              >
                {creating ? '생성 중…' : '수임처 만들기'}
              </button>
              {createError && <p className="text-sm text-rose-300">{createError}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
