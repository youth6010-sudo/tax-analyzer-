'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GachaPhase } from './gachaTimings';
import {
  ballFromPalette,
  buildPileLayout,
  type BallStyle,
  type GachaBall,
} from './gachaBalls';
import './gacha-machine.css';

interface LunchGachaMachineProps {
  phase: GachaPhase;
  balls: GachaBall[];
  winSpotId?: string;
  resultName?: string;
  teaseName?: string;
  leverHeld?: boolean;
  onLeverDown?: () => void;
  onLeverUp?: () => void;
  disabled?: boolean;
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 13) % 92)}%`,
  delay: `${(i % 7) * 0.05}s`,
  dur: `${0.9 + (i % 4) * 0.15}s`,
  color: ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#f97316', '#fde047'][i % 6],
  rot: `${(i * 47) % 360}deg`,
}));

const MAX_PULL = 1;
const PULL_PX = 72;
const MAX_PULL_TRAVEL = 72;

function phaseMessage(phase: GachaPhase, leverHeld: boolean): string {
  if (leverHeld && (phase === 'crank' || phase === 'spin')) {
    return '공이 섞여요… 레버를 놓으면 당첨!';
  }
  switch (phase) {
    case 'idle':
      return '옆 레버를 당기면 공이 섞이고, 놓으면 당첨 공이 나와요';
    case 'crank':
      return '쾅—!';
    case 'spin':
      return '두구두구두구…';
    case 'drop':
      return '당첨 공이 나오는 중…';
    case 'reveal':
      return '당첨 공이 열렸어요!';
    default:
      return '';
  }
}

function ballStyle(ball: BallStyle): CSSProperties {
  return {
    '--ball-color': ball.color,
    '--ball-dark': ball.dark,
    '--ball-hi': ball.hi,
  } as CSSProperties;
}

function LottoBall({ ball, size = 32 }: { ball: BallStyle; size?: number }) {
  return (
    <div
      className="gc-ball"
      style={
        {
          ...ballStyle(ball),
          width: size,
          height: size,
          fontSize: Math.max(8, Math.round(size * 0.28)),
        } as CSSProperties
      }
    >
      <span className="gc-ball-rim" aria-hidden />
      <span className="gc-ball-shine" aria-hidden />
      <span className="gc-ball-shine-sm" aria-hidden />
      <span className="gc-ball-num">{ball.num}</span>
    </div>
  );
}

function WinBall({
  ball,
  size,
  open,
  resultName,
}: {
  ball: BallStyle;
  size: number;
  open: boolean;
  resultName?: string;
}) {
  return (
    <div className={`gc-win-ball ${open ? 'gc-win-ball-open' : ''}`}>
      <div className={`gc-win-ball-roll ${open ? 'gc-win-ball-roll-out' : ''}`}>
        <LottoBall ball={ball} size={size} />
      </div>
      {open && (
        <div
          className="gc-win-ball-split"
          style={{ ...ballStyle(ball), '--ball-d': `${size}px` } as CSSProperties}
        >
          <div className="gc-win-hemi gc-win-hemi-top" aria-hidden />
          <div className="gc-win-hemi gc-win-hemi-bot" aria-hidden />
          {resultName && (
            <div className="gc-win-memo">
              <span className="gc-win-memo-tag">TODAY</span>
              <span className="gc-win-memo-name">{resultName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BallPile({
  balls,
  pileLayout,
  mode,
  mixPower,
  hideBallIndex,
}: {
  balls: GachaBall[];
  pileLayout: ReturnType<typeof buildPileLayout>;
  mode: 'idle' | 'chaos' | 'settled';
  mixPower: number;
  hideBallIndex?: number;
}) {
  return (
    <div
      className={`gc-pile gc-pile-${mode}`}
      style={{ '--mix-power': mixPower } as CSSProperties}
    >
      {balls.map((entry, i) => {
        if (i === hideBallIndex) return null;
        const slot = pileLayout[i];
        if (!slot) return null;
        const ball = ballFromPalette(entry.colorIndex, entry.num);
        return (
          <div
            key={entry.spotId}
            className="gc-pile-item"
            style={
              {
                '--pile-x': slot.x,
                '--pile-y': `${slot.y}px`,
                '--pile-z': slot.z,
                '--chaos-i': i,
              } as CSSProperties
            }
          >
            <LottoBall ball={ball} size={slot.s} />
          </div>
        );
      })}
    </div>
  );
}

export default function LunchGachaMachine({
  phase,
  balls,
  winSpotId,
  resultName,
  leverHeld = false,
  onLeverDown,
  onLeverUp,
  disabled = false,
}: LunchGachaMachineProps) {
  const pileLayout = buildPileLayout(balls.length);
  const leverRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startY: 0, startPull: 0 });
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [springing, setSpringing] = useState(false);

  const isAnimating = phase !== 'idle' && !leverHeld;

  const pileMode =
    leverHeld || phase === 'crank' || phase === 'spin'
      ? 'chaos'
      : phase === 'drop' || phase === 'reveal'
        ? 'settled'
        : 'idle';

  const showWinBall = (phase === 'drop' || phase === 'reveal') && !!resultName && !!winSpotId;
  const hideBallIndex = winSpotId ? balls.findIndex(b => b.spotId === winSpotId) : -1;
  const winEntry = hideBallIndex >= 0 ? balls[hideBallIndex] : null;
  const winBall = winEntry ? ballFromPalette(winEntry.colorIndex, winEntry.num) : null;
  const winBallSize = hideBallIndex >= 0 ? (pileLayout[hideBallIndex]?.s ?? 28) : 28;

  const mixPower = leverHeld ? Math.max(pull, 0.85) : pull;
  const visualPull = leverHeld ? Math.max(pull, 0.94) : pull;
  const useLeverAnim = phase === 'crank' && !dragging;
  const leverTravel = useLeverAnim ? undefined : visualPull * MAX_PULL_TRAVEL;

  useEffect(() => {
    if (leverHeld) {
      setSpringing(false);
      setPull(p => Math.max(p, 0.94));
    } else if (!dragRef.current.active) {
      setSpringing(true);
      setPull(0);
    }
  }, [leverHeld]);

  const updatePullFromPointer = useCallback((clientY: number) => {
    const delta = clientY - dragRef.current.startY;
    const next = Math.min(MAX_PULL, Math.max(0, dragRef.current.startPull + delta / PULL_PX));
    setPull(next);
  }, []);

  const handleLeverDown = (e: React.PointerEvent) => {
    if (disabled || isAnimating) return;
    e.preventDefault();
    leverRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, startY: e.clientY, startPull: pull };
    setDragging(true);
    setSpringing(false);
    onLeverDown?.();
  };

  const handleLeverMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || disabled) return;
    updatePullFromPointer(e.clientY);
  };

  const handleLeverUp = (e: React.PointerEvent) => {
    if (disabled) return;
    dragRef.current.active = false;
    setDragging(false);
    if (leverRef.current?.hasPointerCapture(e.pointerId)) {
      leverRef.current.releasePointerCapture(e.pointerId);
    }
    onLeverUp?.();
  };

  return (
    <div className="gc-wrap mt-6 mx-auto w-full max-w-2xl px-2" aria-label="점심 로또 추첨기">
      <div className="gc-arena">
        <div className="gc-arena-bg" aria-hidden />
        <div className="gc-arena-spotlight" aria-hidden />

        <div className="gc-scene">
          <div className="gc-lotto-stage">
            <div
              className={`gc-lotto ${isAnimating ? `gc-run-${phase}` : ''} ${leverHeld ? 'gc-lotto-mix' : ''}`}
              style={{ '--mix-power': mixPower } as CSSProperties}
            >
              <div className="gc-lotto-core">
                <div className="gc-cabinet">
                  <div className="gc-cabinet-edge gc-cabinet-edge-l" aria-hidden />
                  <div className="gc-cabinet-edge gc-cabinet-edge-r" aria-hidden />
                  <div className="gc-cabinet-header" aria-hidden>
                    <span className="gc-cabinet-emoji">🍱</span>
                    <span className="gc-cabinet-title">LUNCH LOTTO</span>
                    <div className="gc-cabinet-lights">
                      {Array.from({ length: 7 }, (_, i) => (
                        <span key={i} className="gc-led" style={{ '--led-i': i } as CSSProperties} />
                      ))}
                    </div>
                  </div>

                  <div className="gc-cabinet-body">
                    <div className="gc-vessel">
                      <div className="gc-bowl-wrap">
                        <div className="gc-bowl-cast-shadow" aria-hidden />
                        <div className="gc-bowl-ring" aria-hidden />
                        <div className="gc-bowl-ring-inner" aria-hidden />
                        <div className="gc-bowl-stand" aria-hidden />
                        <div className="gc-bowl-inner">
                          <div className="gc-bowl-floor" aria-hidden />
                          <BallPile
                            balls={balls}
                            pileLayout={pileLayout}
                            mode={pileMode}
                            mixPower={mixPower}
                            hideBallIndex={hideBallIndex >= 0 ? hideBallIndex : undefined}
                          />
                        </div>
                        <div className="gc-bowl-glass" aria-hidden />
                        <div className="gc-bowl-glare" aria-hidden />
                        <div className="gc-bowl-glare gc-bowl-glare-sm" aria-hidden />
                        <div className="gc-bowl-exit" aria-hidden />
                      </div>

                      {showWinBall && winBall && (
                        <div className={`gc-win-ball-slot ${phase === 'drop' ? 'gc-win-ball-drop' : ''}`}>
                          <WinBall
                            ball={winBall}
                            size={winBallSize}
                            open={phase === 'reveal'}
                            resultName={resultName}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="gc-cabinet-footer" aria-hidden />
                </div>
              </div>

              <div className="gc-lever-side">
                <div className="gc-lever-mount" aria-hidden />
                <div className="gc-lever-slot">
                  <div className="gc-lever-slot-frame" aria-hidden />
                  <div
                    ref={leverRef}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label="추첨 레버 — 위에서 아래로 당기세요"
                    className={`gc-lever ${dragging ? 'gc-lever-dragging' : ''} ${leverHeld ? 'gc-lever-holding' : ''} ${springing ? 'gc-lever-spring' : ''} ${phase === 'crank' ? 'gc-lever-on' : ''} ${disabled ? 'gc-lever-disabled' : ''}`}
                    onPointerDown={handleLeverDown}
                    onPointerMove={handleLeverMove}
                    onPointerUp={handleLeverUp}
                    onPointerCancel={handleLeverUp}
                    onKeyDown={e => {
                      if (disabled) return;
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        if (!leverHeld) onLeverDown?.();
                      }
                    }}
                    onKeyUp={e => {
                      if (e.key === ' ' || e.key === 'Enter') onLeverUp?.();
                    }}
                  >
                    <div className="gc-lever-hit" />
                    <div
                      className="gc-lever-slider"
                      style={
                        leverTravel !== undefined
                          ? ({ '--lever-y': `${leverTravel}px` } as CSSProperties)
                          : undefined
                      }
                    >
                      <div className="gc-lever-rod" aria-hidden />
                      <div className="gc-lever-knob" aria-hidden />
                    </div>
                    {!disabled && !leverHeld && pull < 0.06 && phase === 'idle' && (
                      <span className="gc-lever-hint">↓</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {phase === 'reveal' && resultName && (
            <>
              <div className="gc-reveal-fx gc-reveal-fx-delayed" aria-hidden>
                <div className="gc-win-rays" />
                <div className="gc-win-ring" />
                {CONFETTI.map(c => (
                  <span
                    key={c.id}
                    className="gc-confetti"
                    style={
                      {
                        left: c.left,
                        backgroundColor: c.color,
                        animationDelay: c.delay,
                        animationDuration: c.dur,
                        '--cr': c.rot,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <div className="gc-memo-overlay gc-memo-overlay-delayed" role="status" aria-live="polite">
                <div className="gc-memo-paper">
                  <span className="gc-memo-tag">🍽️ TODAY&apos;S LUNCH</span>
                  <span className="gc-memo-name">{resultName}</span>
                  <span className="gc-memo-sub">오늘 점심은 여기!</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="gc-shadow" aria-hidden />
      </div>

      <p className={`gc-status gc-status-${phase}`}>
        {phase === 'reveal' && resultName
          ? `🎉 오늘 점심 — ${resultName}`
          : phaseMessage(phase, leverHeld)}
      </p>
    </div>
  );
}
