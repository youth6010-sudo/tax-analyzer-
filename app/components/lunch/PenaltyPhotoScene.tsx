'use client';

import Image from 'next/image';
import type { KickSide } from './penaltyScene';
import { gkDiveSide } from './penaltyScene';

interface PenaltyPhotoSceneProps {
  phase: 'idle' | 'ready' | 'kick' | 'goal' | 'celebrate';
  kickSide: KickSide;
}

/**
 * 슛 연출 — 단일 장면 + 연속 카메라 (끊김 없음)
 * 4컷 크로스페이드 제거, 줌·팬만으로 공 따라가기
 */
export default function PenaltyPhotoScene({ phase, kickSide }: PenaltyPhotoSceneProps) {
  const isReady = phase === 'ready';
  const isKick = phase === 'kick';
  const isGoal = phase === 'goal';
  const gkDive = gkDiveSide(kickSide);

  const sceneClass = [
    'wc-penalty-scene',
    isReady && 'wc-penalty-ready',
    isKick && 'wc-penalty-kick-flow',
    isGoal && 'wc-penalty-goal-hold',
    (isKick || isGoal) && `wc-penalty-pan-${gkDive}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="relative w-full aspect-[4/3] bg-[#060d18] overflow-hidden" aria-label="월드컵 승부차기">
      <div className={`absolute inset-0 overflow-hidden ${sceneClass}`}>
        <Image
          src="/images/penalty-scene-ready.png"
          alt=""
          fill
          priority
          sizes="(max-width: 512px) 100vw, 512px"
          className="object-cover wc-penalty-photo"
        />
        {(isKick || isGoal) && (
          <div className="absolute inset-0 wc-penalty-speed-lines pointer-events-none" aria-hidden />
        )}
      </div>

      <div className="absolute inset-0 pointer-events-none wc-penalty-ui">
        <div className="wc-penalty-scoreboard">★ LUNCH WORLD CUP ★</div>
        <div className="wc-penalty-vignette" />
        {isReady && <div className="wc-penalty-tension-ring" aria-hidden />}
        {isGoal && <div className="wc-goal-net-flash" aria-hidden />}
      </div>
    </div>
  );
}
