'use client';

import type { KickSide } from './penaltyScene';
import { gkDiveSide } from './penaltyScene';
import Penalty2DScene from './Penalty2DScene';

export type PenaltyPhase = 'idle' | 'ready' | 'kick' | 'goal' | 'celebrate';

export { gkDiveSide };
export type { KickSide };

export const PENALTY_TIMINGS = {
  readyMs: 700,
  kickMs: 1000,
  goalFlashMs: 550,
  celebrateMs: 2200,
  cardMs: 400,
} as const;

interface LunchPenaltyFieldProps {
  phase: PenaltyPhase;
  targetName: string;
  hintName?: string;
  kickSide?: KickSide;
  gkSide?: KickSide;
  saved?: boolean;
  /** lunch = 점심컵, staff = 담당자 승부차기 */
  variant?: 'lunch' | 'staff';
}

function phaseLabel(
  phase: PenaltyPhase,
  hintName: string | undefined,
  targetName: string,
  saved: boolean | undefined,
  variant: 'lunch' | 'staff',
): string {
  const isStaff = variant === 'staff';
  switch (phase) {
    case 'idle':
      return isStaff ? '슛 버튼을 눌러 담당자를 골인!' : '슛 버튼을 눌러 오늘의 맛집을 골인!';
    case 'ready':
      return '숨 고르고… 집중…';
    case 'kick':
      return hintName || '…';
    case 'goal':
      return saved ? `🧤 GK 세이브! → ${targetName}` : 'GOAL!';
    case 'celebrate':
      return saved
        ? `🧤 막혔지만… ${targetName}!`
        : isStaff
          ? `🏆 담당 확정 — ${targetName}`
          : `🏆 오늘의 점심 — ${targetName}`;
    default:
      return '';
  }
}

export default function LunchPenaltyField({
  phase,
  targetName,
  hintName,
  kickSide = 'center',
  gkSide,
  saved,
  variant = 'lunch',
}: LunchPenaltyFieldProps) {
  const isGoal = phase === 'goal';
  const isCelebrate = phase === 'celebrate';
  const isPostGoal = isGoal || isCelebrate;
  const isStaff = variant === 'staff';

  const scenePhase = phase === 'idle' ? 'ready' : phase;

  return (
    <div className="mt-6 mx-auto max-w-lg">
      <div className="rounded-2xl overflow-hidden border-2 border-slate-700/60 shadow-2xl shadow-black/40">
        <div className="relative flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#0c1929] via-[#1a365d] to-[#0c1929] text-white text-xs sm:text-sm font-bold border-b border-amber-500/40">
          <span className="flex items-center gap-1.5 text-amber-400 tracking-wider">
            <span className="text-base">🏆</span> {isStaff ? 'STAFF CUP' : 'LUNCH CUP'}
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

        <Penalty2DScene
          phase={scenePhase}
          kickSide={kickSide}
          gkSide={gkSide}
          celebrateName={isCelebrate ? targetName : undefined}
          saved={saved}
        />

        <div className="px-4 py-3 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200 min-h-[3.25rem] flex items-center justify-center text-center">
          <p
            className={`font-bold break-keep leading-snug ${
              isCelebrate
                ? 'text-lg sm:text-xl text-[#c8102e] wc-name-reveal'
                : isGoal
                  ? 'text-base sm:text-lg text-amber-600 font-black'
                  : phase === 'ready'
                    ? 'text-sm text-amber-700 font-bold wc-tension-text'
                    : 'text-sm text-slate-600'
            }`}
          >
            {phaseLabel(phase, hintName, targetName, saved, variant)}
          </p>
        </div>
      </div>
    </div>
  );
}
