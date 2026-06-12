'use client';

import type { CSSProperties } from 'react';

interface PlayerFigure3DProps {
  name?: string;
  number?: string;
  scale?: number;
  shirt?: string;
  shirtDark?: string;
  className?: string;
  hero?: boolean;
}

function fitName(name: string, max = 9): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

/** CSS 3D 인물 — 등 돌린 세레모니 포즈 */
export default function PlayerFigure3D({
  name,
  number = '10',
  scale = 1,
  shirt = '#c8102e',
  shirtDark = '#8b0a20',
  className = '',
  hero = false,
}: PlayerFigure3DProps) {
  const display = name ? fitName(name) : '';
  const nameSize =
    display.length > 8 ? 'text-[7px]' : display.length > 5 ? 'text-[8px]' : hero ? 'text-[10px]' : 'text-[8px]';

  return (
    <div
      className={`p3d-figure ${hero ? 'p3d-hero' : ''} ${className}`}
      style={{ '--p3d-scale': scale, '--p3d-shirt': shirt, '--p3d-shirt-dark': shirtDark } as CSSProperties}
      aria-hidden
    >
      <div className="p3d-root">
        {/* 왼팔 */}
        <div className="p3d-limb p3d-arm-l">
          <div className="p3d-upper-arm" />
          <div className="p3d-forearm" />
          <div className="p3d-hand" />
        </div>
        {/* 오른팔 */}
        <div className="p3d-limb p3d-arm-r">
          <div className="p3d-upper-arm" />
          <div className="p3d-forearm" />
          <div className="p3d-hand" />
        </div>

        {/* 머리 */}
        <div className="p3d-head">
          <div className="p3d-head-back" />
          <div className="p3d-hair" />
          <div className="p3d-neck" />
        </div>

        {/* 상체 3D 박스 */}
        <div className="p3d-torso">
          <div className="p3d-torso-back">
            {number && <span className="p3d-number">{number}</span>}
            {display && <span className={`p3d-name ${nameSize}`}>{display}</span>}
          </div>
          <div className="p3d-torso-front" />
          <div className="p3d-torso-side p3d-torso-side-l" />
          <div className="p3d-torso-side p3d-torso-side-r" />
          <div className="p3d-torso-top" />
        </div>

        {/* 하의 */}
        <div className="p3d-shorts" />
        <div className="p3d-legs">
          <div className="p3d-leg">
            <div className="p3d-sock" />
            <div className="p3d-boot" />
          </div>
          <div className="p3d-leg">
            <div className="p3d-sock" />
            <div className="p3d-boot" />
          </div>
        </div>

        <div className="p3d-shadow" />
      </div>
    </div>
  );
}
