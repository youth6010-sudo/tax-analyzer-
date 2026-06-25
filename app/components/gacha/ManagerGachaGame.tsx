'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import { MANAGER_DISPLAY_ORDER } from '@/app/utils/clientsGrouping';
import LunchGachaMachine from '@/app/components/lunch/LunchGachaMachine';
import type { GachaBall } from '@/app/components/lunch/gachaBalls';
import { GACHA_TIMINGS, type GachaPhase } from '@/app/components/lunch/gachaTimings';
import { MANAGER_GACHA_THEME } from '@/app/components/gacha/gachaThemes';

const POOL_STORAGE_KEY = 'manager-gacha-pool-v1';
const MIN_HOLD_MS = 450;

type GachaStep = 'idle' | 'done';

const MANAGER_ACCENT: Record<string, string> = {
  블루: 'from-sky-100 to-blue-100 ring-sky-200 text-sky-900',
  다야: 'from-rose-100 to-pink-100 ring-rose-200 text-rose-900',
  윈터: 'from-cyan-100 to-teal-100 ring-cyan-200 text-teal-900',
  리아: 'from-fuchsia-100 to-purple-100 ring-fuchsia-200 text-purple-900',
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

export default function ManagerGachaGame() {
  const [selected, setSelected] = useState<string[]>(() => [...MANAGER_DISPLAY_ORDER]);
  const [hydrated, setHydrated] = useState(false);

  const [gachaStep, setGachaStep] = useState<GachaStep>('idle');
  const [gachaPhase, setGachaPhase] = useState<GachaPhase>('idle');
  const [leverHeld, setLeverHeld] = useState(false);
  const [teaseName, setTeaseName] = useState('');
  const [resultName, setResultName] = useState('');
  const [winManager, setWinManager] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

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

  const pool = useMemo(() => selected.slice().sort((a, b) => compareManagers(a, b)), [selected]);
  const gachaBusy = gachaPhase !== 'idle' || leverHeld;
  const playing = gachaBusy;

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
        colorIndex: MANAGER_DISPLAY_ORDER.indexOf(manager) >= 0 ? MANAGER_DISPLAY_ORDER.indexOf(manager) : i,
      })),
    [pool],
  );

  const resetDraw = useCallback(() => {
    clearTimers();
    setGachaStep('idle');
    setGachaPhase('idle');
    setLeverHeld(false);
    setTeaseName('');
    setResultName('');
    setWinManager(null);
    setShowResult(false);
  }, [clearTimers]);

  const toggleManager = (manager: string) => {
    if (playing) return;
    resetDraw();
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
    if (playing) return;
    resetDraw();
    setSelected([...MANAGER_DISPLAY_ORDER]);
  };

  const revealWinner = useCallback(
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
  }, [pool.length, gachaBusy, leverHeld, gachaStep, gachaPhase, cancelCrank, startTease]);

  const handleLeverUp = useCallback(() => {
    if (!leverHeld) return;
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
    revealWinner(winner);
  }, [leverHeld, pool, revealWinner, cancelCrank]);

  const showGachaCapsule = gachaPhase === 'drop' || gachaPhase === 'reveal';
  const realName = winManager ? STAFF_REAL_NAMES[winManager] : undefined;

  return (
    <section className="rounded-2xl border border-indigo-300/40 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-blue-950/15 p-5 sm:p-8 shadow-xl shadow-indigo-900/10 ring-1 ring-white/5">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-400">STAFF PICK</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">담당자 뽑기</h2>
        <p className="mt-2 text-sm text-indigo-100/90 leading-relaxed">후보를 고르고 가챠머신으로 한 명을 뽑아요</p>
      </div>

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
                  <span className={`text-[11px] font-medium ${checked ? 'text-indigo-100/80' : 'text-indigo-300/50'}`}>
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

      {gachaStep === 'done' && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={resetDraw}
            className="text-xs font-semibold text-indigo-300 hover:text-white underline"
          >
            다시 뽑기
          </button>
        </div>
      )}

      {showResult && winManager && (
        <div className="mt-8 lunch-reveal-slide">
          <p className="mb-3 text-center text-base font-black text-indigo-700">🎉 당첨 담당자</p>
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
          </div>
        </div>
      )}

      {pool.length === 0 && (
        <p className="mt-4 text-center text-sm text-red-400">뽑을 담당자가 없습니다. 후보를 선택해 주세요.</p>
      )}
    </section>
  );
}

function compareManagers(a: string, b: string): number {
  const ia = MANAGER_DISPLAY_ORDER.indexOf(a);
  const ib = MANAGER_DISPLAY_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, 'ko');
}
