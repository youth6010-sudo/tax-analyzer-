'use client';

import type { CSSProperties } from 'react';

const SHIRTS = ['#c8102e', '#1d4ed8', '#fff', '#facc15', '#16a34a', '#003478', '#ea580c'];
const SKIN = ['#fcd9b6', '#e8b88a', '#d4a574', '#f5cba7'];

interface SpectatorProps {
  shirt: string;
  skin: string;
  armUp: boolean;
  delay: number;
  scale: number;
}

function Spectator3D({ shirt, skin, armUp, delay, scale }: SpectatorProps) {
  return (
    <div
      className={`crowd-person ${armUp ? 'crowd-person-cheer' : ''}`}
      style={
        {
          '--cp-scale': scale,
          '--cp-delay': `${delay}s`,
          '--cp-shirt': shirt,
          '--cp-skin': skin,
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="crowd-person-inner">
        {armUp && (
          <>
            <div className="crowd-arm crowd-arm-l" />
            <div className="crowd-arm crowd-arm-r" />
          </>
        )}
        <div className="crowd-head" />
        <div className="crowd-torso" />
      </div>
    </div>
  );
}

/** 원근 관중석 — 4단 + 3D 사람 실루엣 */
export default function CrowdStand3D() {
  const rows = [
    { count: 13, scale: 0.38, opacity: 0.55, z: -80 },
    { count: 15, scale: 0.48, opacity: 0.7, z: -50 },
    { count: 17, scale: 0.58, opacity: 0.85, z: -25 },
    { count: 19, scale: 0.72, opacity: 1, z: 0 },
  ];

  return (
    <div className="crowd-stand" aria-hidden>
      <div className="crowd-stand-rail" />
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="crowd-row"
          style={{ '--row-z': row.z, '--row-opacity': row.opacity } as React.CSSProperties}
        >
          {Array.from({ length: row.count }, (_, i) => (
            <Spectator3D
              key={i}
              shirt={SHIRTS[(ri * 3 + i) % SHIRTS.length]}
              skin={SKIN[(ri + i) % SKIN.length]}
              armUp={(i + ri) % 3 !== 0}
              delay={(i % 5) * 0.08 + ri * 0.05}
              scale={row.scale}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
