/** penalty-scene-ready.png 기준 % 좌표 (400×300 viewBox 환산) */
export const PENALTY_SPOT_PCT = { x: 50, y: 84 } as const;

/** 골망 안쪽 착점 — 골대 포스트 안 (이미지 기준) */
export const GOAL_NET_PCT = {
  left: { x: 44, y: 31 },
  center: { x: 50, y: 29 },
  right: { x: 56, y: 31 },
} as const;

export type KickSide = 'left' | 'center' | 'right';

export function netPointPct(side: KickSide) {
  return GOAL_NET_PCT[side];
}

/** GK는 공 반대 방향으로 다이빙 */
export function gkDiveSide(kickSide: KickSide): 'left' | 'right' | 'center' {
  if (kickSide === 'left') return 'right';
  if (kickSide === 'right') return 'left';
  return 'center';
}

export const KICK_ANIM_MS = 960;
