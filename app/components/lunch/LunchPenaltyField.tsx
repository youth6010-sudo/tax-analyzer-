'use client';

import type { KickSide } from './penaltyScene';
import { gkDiveSide } from './penaltyScene';
import PenaltyBallOverlay from './PenaltyBallOverlay';
import PenaltyPhotoScene from './PenaltyPhotoScene';
import CelebrationCeremony from './CelebrationCeremony';

export type PenaltyPhase = 'idle' | 'ready' | 'kick' | 'goal' | 'celebrate';

export { gkDiveSide };
export type { KickSide };

export const PENALTY_TIMINGS = {
  readyMs: 650,
  kickMs: 960,
  goalFlashMs: 550,
  celebrateMs: 2200,
  cardMs: 400,
} as const;

interface LunchPenaltyFieldProps {
  phase: PenaltyPhase;
  targetName: string;
  hintName?: string;
  kickSide?: KickSide;
}

const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  left: `${3 + ((i * 11) % 94)}%`,
  delay: `${(i % 8) * 0.05}s`,
  color: ['#fbbf24', '#c8102e', '#003478', '#fff', '#16a34a'][i % 5],
  size: 4 + (i % 4) * 2,
}));

function phaseLabel(phase: PenaltyPhase, hintName: string | undefined, targetName: string): string {
  switch (phase) {
    case 'idle':
      return '슛 버튼을 눌러 오늘의 맛집을 골인!';
    case 'ready':
      return '숨 고르고… 집중…';
    case 'kick':
      return hintName || '…';
    case 'goal':
      return 'GOAL!';
    case 'celebrate':
      return `🏆 오늘의 점심 — ${targetName}`;
    default:
      return '';
  }
}

function cameraClass(phase: PenaltyPhase): string {
  if (phase === 'ready') return 'wc-cam-ready';
  if (phase === 'kick') return 'wc-cam-kick';
  if (phase === 'goal') return 'wc-cam-goal';
  if (phase === 'celebrate') return 'wc-cam-celebrate';
  return '';
}

export default function LunchPenaltyField({
  phase,
  targetName,
  hintName,
  kickSide = 'center',
}: LunchPenaltyFieldProps) {
  const isReady = phase === 'ready';
  const isKick = phase === 'kick';
  const isGoal = phase === 'goal';
  const isCelebrate = phase === 'celebrate';
  const isPostGoal = isGoal || isCelebrate;
  const isActive = isReady || isKick || isPostGoal;
  const showPlay = !isCelebrate;

  const ballPhase =
    phase === 'ready' || phase === 'kick' || phase === 'goal' || phase === 'idle'
      ? phase
      : 'idle';

  return (
    <div className="mt-6 mx-auto max-w-lg">
      <div className="rounded-2xl overflow-hidden border-2 border-slate-700/60 shadow-2xl shadow-black/40">
        <div className="relative flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#0c1929] via-[#1a365d] to-[#0c1929] text-white text-xs sm:text-sm font-bold border-b border-amber-500/40">
          <span className="flex items-center gap-1.5 text-amber-400 tracking-wider">
            <span className="text-base">🏆</span> LUNCH CUP
          </span>
          <span
            className={`tabular-nums text-xl sm:text-2xl font-black px-4 py-0.5 rounded-md bg-black/50 border border-amber-500/30 ${
              isPostGoal ? 'wc-score-pop text-amber-300' : 'text-white'
            }`}
          >
            {isPostGoal ? '1 - 0' : '0 - 0'}
          </span>
          <span className="text-sky-300 text-xs sm:text-sm">LIVE 🇰🇷</span>
        </div>

        <div className="wc-scene-3d bg-[#0c1929]">
          <div
            className={`relative wc-scene-inner ${cameraClass(phase)} ${
              isGoal ? 'wc-scene-shake' : ''
            } ${isCelebrate ? 'wc-scene-celebrate' : ''}`}
          >
            <PenaltyPhotoScene phase={phase} kickSide={kickSide} />

            <PenaltyBallOverlay visible={showPlay} phase={ballPhase} kickSide={kickSide} />

            {isGoal && (
              <div className="absolute inset-0 z-[35] flex items-start justify-center pt-[24%] pointer-events-none">
                <div className="wc-goal-banner-html">
                  <span className="wc-goal-text-html">⚽ GOAL!</span>
                </div>
              </div>
            )}

            {isCelebrate && targetName && <CelebrationCeremony name={targetName} />}

            {isReady && <div className="absolute inset-0 wc-tension-vignette pointer-events-none z-20" />}
            {isKick && <div className="absolute inset-0 wc-kick-flash pointer-events-none z-20" />}
            {isPostGoal && (
              <div className={`absolute inset-0 pointer-events-none overflow-hidden ${isCelebrate ? 'z-50' : 'z-[25]'}`}>
                {isGoal && <div className="absolute inset-0 wc-goal-flash" />}
                {CONFETTI.map(c => (
                  <span
                    key={c.id}
                    className={`absolute wc-confetti ${isCelebrate ? 'wc-confetti-long' : ''}`}
                    style={{
                      left: c.left,
                      top: isCelebrate ? '6%' : '22%',
                      width: c.size,
                      height: c.size,
                      backgroundColor: c.color,
                      animationDelay: c.delay,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200 min-h-[3.25rem] flex items-center justify-center text-center">
          <p
            className={`font-bold break-keep leading-snug ${
              isCelebrate
                ? 'text-lg sm:text-xl text-[#c8102e] wc-name-reveal'
                : isGoal
                  ? 'text-base sm:text-lg text-amber-600 font-black'
                  : isReady
                    ? 'text-sm text-amber-700 font-bold wc-tension-text'
                    : isActive
                      ? 'text-sm text-slate-600'
                      : 'text-sm text-slate-400'
            }`}
          >
            {phaseLabel(phase, hintName, targetName)}
          </p>
        </div>
      </div>
    </div>
  );
}
