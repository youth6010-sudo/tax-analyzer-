export const GACHA_TIMINGS = {
  crankMs: 700,
  spinMs: 1400,
  dropMs: 900,
  revealMs: 1800,
  cardMs: 400,
} as const;

export type GachaPhase = 'idle' | 'crank' | 'spin' | 'drop' | 'reveal';
