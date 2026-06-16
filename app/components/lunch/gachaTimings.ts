export const GACHA_TIMINGS = {

  crankMs: 700,

  spinMs: 1400,

  dropMs: 1400,

  revealMs: 2800,

  cardMs: 400,

} as const;



export type GachaPhase = 'idle' | 'crank' | 'spin' | 'drop' | 'reveal';

