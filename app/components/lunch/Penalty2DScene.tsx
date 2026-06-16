'use client';

import type { CSSProperties } from 'react';
import type { KickSide } from './penaltyScene';
import { gkDiveSide } from './penaltyScene';
import './penalty-2d.css';

interface Penalty2DSceneProps {
  phase: 'idle' | 'ready' | 'kick' | 'goal' | 'celebrate';
  kickSide: KickSide;
  gkSide?: KickSide;
  celebrateName?: string;
  saved?: boolean;
}

const FIREWORKS = [
  { x: '12%', y: '10%', delay: '0s', color: '#fbbf24' },
  { x: '88%', y: '8%', delay: '0.2s', color: '#ef4444' },
  { x: '75%', y: '15%', delay: '0.45s', color: '#60a5fa' },
  { x: '22%', y: '12%', delay: '0.7s', color: '#22c55e' },
];

export default function Penalty2DScene({
  phase,
  kickSide,
  gkSide,
  celebrateName,
  saved,
}: Penalty2DSceneProps) {
  const isReady = phase === 'ready';
  const isKick = phase === 'kick';
  const isGoal = phase === 'goal';
  const isCelebrate = phase === 'celebrate';
  const gkDive = gkSide ?? gkDiveSide(kickSide);

  const gkClass = isKick || isGoal
    ? gkDive === 'left'
      ? 'pk2-gk-dive-left'
      : gkDive === 'right'
        ? 'pk2-gk-dive-right'
        : 'pk2-gk-dive-center'
    : isReady
      ? 'pk2-gk-idle'
      : '';

  const kickerClass = [
    isReady && 'pk2-kicker-ready',
    isKick && `pk2-kicker-kick-${kickSide}`,
    isGoal && `pk2-kicker-follow-${kickSide}`,
  ]
    .filter(Boolean)
    .join(' ');

  const ballClass = [
    'pk2-ball',
    isReady && 'pk2-ball-ready',
    isKick && `pk2-ball-kick-${kickSide}`,
    isGoal && (saved ? `pk2-ball-saved-${kickSide}` : `pk2-ball-goal-${kickSide}`),
  ]
    .filter(Boolean)
    .join(' ');

  const shadowClass = [
    'pk2-ball-shadow',
    isReady && 'pk2-shadow-ready',
    isKick && `pk2-shadow-kick-${kickSide}`,
    isGoal && 'pk2-shadow-goal',
  ]
    .filter(Boolean)
    .join(' ');

  const sceneClass = [
    isKick && 'pk2-kick',
    isGoal && 'pk2-goal-flash',
    isCelebrate && 'pk2-celebrate-scene',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`pk2-scene ${sceneClass}`} aria-label="승부차기">
      <div className="pk2-sky-glow" aria-hidden />
      <div className="pk2-crowd" aria-hidden />
      <div className="pk2-grass" aria-hidden />
      <div className="pk2-field-lines" aria-hidden />
      <div className="pk2-penalty-arc" aria-hidden />
      <div className="pk2-penalty-spot" aria-hidden />

      <div className="pk2-goal" aria-hidden>
        <div className="pk2-goal-frame" />
        <div className="pk2-goal-net" />
        <div className="pk2-net-flash" />
      </div>

      <div className={`pk2-gk-wrap ${gkClass}`} aria-hidden>
        <div className="pk2-gk-head" />
        <div className="pk2-gk-body" />
        <div className="pk2-gk-arm-l" />
        <div className="pk2-gk-arm-r" />
        <div className="pk2-gk-leg-l" />
        <div className="pk2-gk-leg-r" />
      </div>

      {!isCelebrate && (
        <>
          <div className={`pk2-kicker ${kickerClass}`} aria-hidden>
            <div className="pk2-kicker-head" />
            <div className="pk2-kicker-body" />
            <div className="pk2-kicker-arm" />
            <div className="pk2-kicker-leg-stand" />
            <div className="pk2-kicker-leg-kick" />
          </div>
          {(isReady || isKick || isGoal) && (
            <>
              <div className={shadowClass} aria-hidden />
              <div className={ballClass} aria-hidden />
            </>
          )}
        </>
      )}

      <div className="pk2-speed" aria-hidden />
      <div className="pk2-vignette" aria-hidden />

      {isCelebrate && celebrateName && (
        <div className="pk2-celebrate">
          {FIREWORKS.map((fw, i) => (
            <span
              key={i}
              className="pk2-cele-firework"
              style={
                {
                  left: fw.x,
                  top: fw.y,
                  animationDelay: fw.delay,
                  '--fw-color': fw.color,
                } as CSSProperties
              }
              aria-hidden
            />
          ))}
          <div className="pk2-cele-banner">
            <p className="text-[10px] font-black text-amber-200 tracking-[0.3em]">LUNCH CUP</p>
            <p className="text-lg sm:text-xl font-black text-white">
              {saved ? '🧤 결과 확정' : '🏆 GOAL!'}
            </p>
          </div>
          <p className="text-sm sm:text-base font-black text-white text-center px-4 drop-shadow-lg">
            {celebrateName}
          </p>
        </div>
      )}
    </div>
  );
}
