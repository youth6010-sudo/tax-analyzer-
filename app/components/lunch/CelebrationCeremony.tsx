'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';

interface CelebrationCeremonyProps {
  name: string;
}

const FIREWORKS = [
  { x: '10%', y: '6%', delay: '0s', color: '#fbbf24' },
  { x: '85%', y: '10%', delay: '0.25s', color: '#ef4444' },
  { x: '72%', y: '4%', delay: '0.5s', color: '#60a5fa' },
  { x: '25%', y: '8%', delay: '0.75s', color: '#fbbf24' },
];

function fitJerseyName(name: string, max = 8): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

/** AI 생성 포토리얼 세레모니 — 실제 사람·관중 + 등 유니폼 맛집명 */
export default function CelebrationCeremony({ name }: CelebrationCeremonyProps) {
  const jerseyName = fitJerseyName(name);
  const nameSize =
    jerseyName.length > 7 ? 'text-[7px] sm:text-[8px]' : jerseyName.length > 5 ? 'text-[8px] sm:text-[10px]' : 'text-[9px] sm:text-[11px]';

  return (
    <div className="absolute inset-0 z-40 overflow-hidden pointer-events-none cele-arena cele-arena-photo cele-from-goal">
      {/* 포토리얼 경기장 + 관중 + 선수 */}
      <div className="cele-photo-wrap" aria-hidden>
        <Image
          src="/images/lunch-celebration-scene.png"
          alt=""
          fill
          priority
          sizes="(max-width: 512px) 100vw, 512px"
          className="object-cover object-[center_42%] cele-photo-zoom"
        />
        <div className="cele-photo-shine" />
        <div className="cele-photo-vignette" />
      </div>

      {/* 등 유니폼 — 맛집 이름 오버레이 */}
      <div className="cele-jersey-overlay" aria-hidden>
        <span className="cele-jersey-number">7</span>
        <span className={`cele-jersey-name ${nameSize}`}>{jerseyName}</span>
      </div>

      {/* 폭죽 (이미지 위 레이어) */}
      {FIREWORKS.map((fw, i) => (
        <div
          key={i}
          className="wc-cele-firework cele-firework-on-photo"
          style={{ left: fw.x, top: fw.y, animationDelay: fw.delay, '--fw-color': fw.color } as CSSProperties}
          aria-hidden
        />
      ))}

      {/* 배너 */}
      <div className="absolute top-2 sm:top-3 left-0 right-0 flex justify-center wc-cele-banner-wrap z-20">
        <div className="wc-cele-champion-banner cele-banner-glass">
          <span className="text-[10px] sm:text-xs font-black text-amber-200/90 tracking-[0.35em]">LUNCH CUP</span>
          <span className="text-base sm:text-lg font-black text-white">🏆 CHAMPION</span>
        </div>
      </div>

      {/* 맛집 플래카드 */}
      <div className="absolute bottom-2 sm:bottom-3 left-0 right-0 flex justify-center wc-cele-nameplate-wrap z-50">
        <div className="wc-cele-nameplate cele-nameplate-glow">
          <span className="text-[10px] text-amber-300/90 font-bold tracking-widest">TODAY&apos;S LUNCH</span>
          <span className="text-sm sm:text-base font-black text-white">
            {name.length > 12 ? `${name.slice(0, 11)}…` : name}
          </span>
        </div>
      </div>
    </div>
  );
}
