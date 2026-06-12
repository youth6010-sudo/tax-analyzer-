'use client';

import type { KickSide } from './penaltyScene';

interface PenaltyBallOverlayProps {
  visible: boolean;
  phase: 'idle' | 'ready' | 'kick' | 'goal';
  kickSide: KickSide;
}

export default function PenaltyBallOverlay({ visible, phase, kickSide }: PenaltyBallOverlayProps) {
  if (!visible) return null;

  const cls = [
    'wc-ball-overlay',
    phase === 'ready' && 'wc-ball-ov-ready',
    phase === 'kick' && `wc-ball-ov-kick wc-ball-ov-kick-${kickSide}`,
    phase === 'goal' && `wc-ball-ov-goal wc-ball-ov-goal-${kickSide}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {phase === 'kick' &&
        [0, 1, 2].map(i => (
          <div key={i} className={`wc-ball-ghost-ov wc-ball-ghost-ov-${kickSide} wc-ghost-ov-${i}`} aria-hidden>
            <BallGraphic size="sm" />
          </div>
        ))}
      <div className={cls} aria-hidden>
        <div className="wc-ball-ov-shadow" />
        <BallGraphic size="lg" spinning={phase === 'kick'} />
      </div>
    </div>
  );
}

function BallGraphic({ size, spinning }: { size: 'sm' | 'lg'; spinning?: boolean }) {
  const dim = size === 'lg' ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-6 h-6';
  return (
    <div className={`relative ${dim} ${spinning ? 'wc-ball-spin' : ''}`}>
      <div className="wc-ball-sphere" aria-hidden>
        <div className="wc-ball-panel wc-ball-p1" />
        <div className="wc-ball-panel wc-ball-p2" />
        <div className="wc-ball-panel wc-ball-p3" />
        <div className="wc-ball-panel wc-ball-p4" />
        <div className="wc-ball-panel wc-ball-p5" />
        <div className="wc-ball-highlight" />
      </div>
    </div>
  );
}
