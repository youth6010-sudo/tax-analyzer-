'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GachaPhase } from './gachaTimings';
import './gacha-machine.css';

interface LunchGachaMachineProps {
  phase: GachaPhase;
  resultName?: string;
  teaseName?: string;
}

const CAPSULES = [
  { color: '#f472b6', dark: '#db2777', emoji: '🍜' },
  { color: '#60a5fa', dark: '#2563eb', emoji: '🍱' },
  { color: '#fbbf24', dark: '#d97706', emoji: '🍔' },
  { color: '#4ade80', dark: '#16a34a', emoji: '🥗' },
  { color: '#c084fc', dark: '#9333ea', emoji: '🍣' },
  { color: '#fb923c', dark: '#ea580c', emoji: '🌮' },
  { color: '#f9a8d4', dark: '#ec4899', emoji: '🍕' },
  { color: '#67e8f9', dark: '#0891b2', emoji: '🥪' },
  { color: '#fde047', dark: '#ca8a04', emoji: '🍛' },
  { color: '#a3e635', dark: '#65a30d', emoji: '🥘' },
  { color: '#fda4af', dark: '#e11d48', emoji: '🌯' },
  { color: '#93c5fd', dark: '#3b82f6', emoji: '🍝' },
];

const MARQUEE_BULBS = 14;
const SPARKS = Array.from({ length: 8 }, (_, i) => i);
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${4 + ((i * 13) % 92)}%`,
  delay: `${(i % 7) * 0.05}s`,
  dur: `${0.9 + (i % 4) * 0.15}s`,
  color: ['#f472b6', '#60a5fa', '#fbbf24', '#4ade80', '#c084fc', '#fde047'][i % 6],
  rot: `${(i * 47) % 360}deg`,
}));

function phaseMessage(phase: GachaPhase): string {
  switch (phase) {
    case 'idle':
      return '레버를 당기면 오늘의 점심 캡슐이 나와요';
    case 'crank':
      return '쾅—!';
    case 'spin':
      return '두구두구두구…';
    case 'drop':
      return '캡슐 등장!';
    case 'reveal':
      return '🎉 오늘 점심 확정!';
    default:
      return '';
  }
}

function CapsuleDrum({ speed }: { speed: 'idle' | 'fast' | 'slowdown' }) {
  return (
    <div className={`gc-drum gc-drum-${speed}`}>
      {CAPSULES.map((cap, i) => (
        <div
          key={i}
          className="gc-toy"
          style={
            {
              '--toy-i': i,
              '--toy-color': cap.color,
              '--toy-dark': cap.dark,
              '--toy-z': i % 2 === 0 ? '76px' : '52px',
            } as CSSProperties
          }
        >
          <div className="gc-toy-cap" />
          <div className="gc-toy-ring" />
          <div className="gc-toy-body" />
          <span className="gc-toy-emoji">{cap.emoji}</span>
        </div>
      ))}
    </div>
  );
}

export default function LunchGachaMachine({ phase, resultName, teaseName }: LunchGachaMachineProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const isActive = phase !== 'idle';
  const drumSpeed =
    phase === 'spin' || phase === 'crank'
      ? 'fast'
      : phase === 'drop' || phase === 'reveal'
        ? 'slowdown'
        : 'idle';

  const screenText =
    phase === 'reveal' || phase === 'drop' ? resultName : phase === 'spin' ? teaseName : undefined;

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      if (isActive || !sceneRef.current) return;
      const rect = sceneRef.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setTilt({ x: -py * 6, y: px * 10 });
    },
    [isActive],
  );

  useEffect(() => {
    if (isActive) setTilt({ x: 0, y: 0 });
  }, [isActive]);

  const cabinetTransform =
    !isActive && (tilt.x !== 0 || tilt.y !== 0)
      ? `rotateX(${10 + tilt.x}deg) rotateY(${-6 + tilt.y}deg)`
      : undefined;

  return (
    <div className="gc-wrap mt-6 mx-auto max-w-lg" aria-label="점심 가챠머신">
      <div className="gc-arena">
        <div className="gc-arena-bg" aria-hidden />
        <div className="gc-arena-floor" aria-hidden />
        <div className="gc-arena-spot" aria-hidden />

        <div
          ref={sceneRef}
          className="gc-scene"
          onMouseMove={handleMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        >
          <div
            className={`gc-cabinet ${isActive ? `gc-run-${phase}` : ''}`}
            style={cabinetTransform ? { transform: cabinetTransform } : undefined}
          >
            {/* 측면 패널 */}
            <div className="gc-side gc-side-l" aria-hidden />
            <div className="gc-side gc-side-r" aria-hidden />

            {/* 마키 */}
            <div className="gc-marquee">
              <div className="gc-marquee-track">
                {Array.from({ length: MARQUEE_BULBS }, (_, i) => (
                  <span key={i} className="gc-bulb" style={{ '--bi': i } as CSSProperties} />
                ))}
              </div>
              <div className="gc-marquee-text">
                <span>LUCKY</span>
                <strong>LUNCH</strong>
                <span>GACHA</span>
              </div>
            </div>

            {/* 돔 */}
            <div className="gc-dome-wrap">
              <div className="gc-dome-rim" aria-hidden />
              <div className="gc-dome-inner">
                <CapsuleDrum speed={drumSpeed} />
                {SPARKS.map(i => (
                  <span key={i} className="gc-spark" style={{ '--si': i } as CSSProperties} />
                ))}
              </div>
              <div className="gc-dome-glass" aria-hidden />
              <div className="gc-dome-glare" aria-hidden />
            </div>

            {/* 본체 */}
            <div className="gc-front">
              <div className="gc-front-stripe" aria-hidden />

              <div className="gc-display">
                <div className="gc-display-bezel">
                  <span className="gc-display-label">MENU</span>
                  <div className={`gc-display-screen ${phase === 'spin' ? 'gc-display-roll' : ''}`}>
                    <div className="gc-scanlines" aria-hidden />
                    {screenText ? (
                      <span className="gc-display-text">{fit(screenText)}</span>
                    ) : (
                      <span className="gc-display-idle">READY</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="gc-chute">
                <div className="gc-chute-lip" />
                <div className="gc-chute-tunnel" />
              </div>

              <div className="gc-coin">100</div>
            </div>

            {/* 레버 */}
            <div className={`gc-lever ${phase === 'crank' ? 'gc-lever-on' : ''}`}>
              <div className="gc-lever-base" />
              <div className="gc-lever-shaft" />
              <div className="gc-lever-ball" />
            </div>

            <div className="gc-pedestal" aria-hidden>
              <div className="gc-pedestal-top" />
              <div className="gc-pedestal-foot gc-pedestal-foot-l" />
              <div className="gc-pedestal-foot gc-pedestal-foot-r" />
            </div>
          </div>

          {/* 당첨 캡슐 */}
          {(phase === 'drop' || phase === 'reveal') && resultName && (
            <div className={`gc-win ${phase === 'reveal' ? 'gc-win-open' : ''}`}>
              <div className="gc-win-capsule">
                <div className="gc-win-cap" />
                <div className="gc-win-body">
                  <div className="gc-win-paper">
                    <span className="gc-win-tag">TODAY&apos;S LUNCH</span>
                    <span className="gc-win-name">{resultName}</span>
                  </div>
                </div>
              </div>
              {phase === 'reveal' && (
                <>
                  <div className="gc-win-rays" aria-hidden />
                  <div className="gc-win-ring" aria-hidden />
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
                      aria-hidden
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="gc-shadow" aria-hidden />
      </div>

      <p className={`gc-status gc-status-${phase}`}>{phaseMessage(phase)}</p>
    </div>
  );
}

function fit(name: string, max = 10): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}
