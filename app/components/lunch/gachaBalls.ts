export type GachaBall = {
  spotId: string;
  num: string;
  colorIndex: number;
};

export type PileSlot = {
  x: string;
  y: number;
  z: number;
  s: number;
};

export type BallPaletteEntry = {
  color: string;
  dark: string;
  hi: string;
  /** 공 번호 글자색. 미지정 시 기본 흰색. (파스텔 공은 가독성 위해 진한 색) */
  text?: string;
};

export type GachaBallVariant = 'arcade' | 'pastel';

export const BALL_PALETTE: BallPaletteEntry[] = [
  { color: '#ef4444', dark: '#b91c1c', hi: '#fca5a5' },
  { color: '#eab308', dark: '#a16207', hi: '#fde047' },
  { color: '#22c55e', dark: '#15803d', hi: '#86efac' },
  { color: '#3b82f6', dark: '#1d4ed8', hi: '#93c5fd' },
  { color: '#f97316', dark: '#c2410c', hi: '#fdba74' },
  { color: '#ec4899', dark: '#be185d', hi: '#f9a8d4' },
  { color: '#8b5cf6', dark: '#6d28d9', hi: '#c4b5fd' },
  { color: '#14b8a6', dark: '#0f766e', hi: '#5eead4' },
  { color: '#f43f5e', dark: '#be123c', hi: '#fda4af' },
  { color: '#84cc16', dark: '#4d7c0f', hi: '#bef264' },
  { color: '#06b6d4', dark: '#0e7490', hi: '#67e8f9' },
  { color: '#a855f7', dark: '#7e22ce', hi: '#d8b4fe' },
  { color: '#fb7185', dark: '#e11d48', hi: '#fecdd3' },
  { color: '#eab308', dark: '#854d0e', hi: '#fde047' },
  { color: '#10b981', dark: '#047857', hi: '#6ee7b7' },
  { color: '#6366f1', dark: '#4338ca', hi: '#a5b4fc' },
];

/** 파스텔(분홍/민트/크림/라벤더/피치) — 점심 가챠 전용. 글자는 진한 색으로 가독성 확보. */
export const PASTEL_BALL_PALETTE: BallPaletteEntry[] = [
  { color: '#fbbcd4', dark: '#f48fb6', hi: '#ffe1ee', text: '#a81e5d' },
  { color: '#a9e7d8', dark: '#6fd0bd', hi: '#d7f7ef', text: '#0f766e' },
  { color: '#ffe1a0', dark: '#fbcf6b', hi: '#fff4d2', text: '#9a6700' },
  { color: '#c9bcfb', dark: '#a890f6', hi: '#e8e1ff', text: '#6b21a8' },
  { color: '#ffc4a3', dark: '#fda47c', hi: '#ffe3d2', text: '#9a3412' },
  { color: '#b4ddf7', dark: '#85c5ef', hi: '#dceffb', text: '#0b5e8a' },
  { color: '#f7b8c8', dark: '#ef93ab', hi: '#ffdde6', text: '#9d174d' },
  { color: '#c7ecb0', dark: '#a3da86', hi: '#e6f8d8', text: '#3f6212' },
  { color: '#ffd1e3', dark: '#fba8ca', hi: '#ffe7f1', text: '#a3155f' },
  { color: '#b8e3e0', dark: '#86ccc8', hi: '#dcf4f2', text: '#115e59' },
  { color: '#e3c9f5', dark: '#cba6ee', hi: '#f1e3fb', text: '#7e22ce' },
  { color: '#ffe7a8', dark: '#fbd778', hi: '#fff6da', text: '#92600a' },
];

export type BallStyle = BallPaletteEntry & { num: string };

export function ballFromPalette(
  colorIndex: number,
  num: string,
  variant: GachaBallVariant = 'arcade',
): BallStyle {
  const palette = variant === 'pastel' ? PASTEL_BALL_PALETTE : BALL_PALETTE;
  const base = palette[colorIndex % palette.length];
  return { ...base, num };
}

/** 구 안 공 배치 — pool 길이에 맞춰 동적 생성 */
export function buildPileLayout(count: number): PileSlot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: '50%', y: 22, z: 2, s: 34 }];

  const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.35)));
  const rows = Math.ceil(count / cols);
  const size =
    count <= 5 ? 32
      : count <= 10 ? 28
        : count <= 18 ? 24
          : count <= 30 ? 20
            : count <= 50 ? 17
              : 14;

  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const xPct = 10 + ((col + 0.5) / cols) * 80;
    const yPx = 6 + (row / Math.max(rows - 1, 1)) * 64;
    const jitter = ((i * 7 + 3) % 5) - 2;
    return {
      x: `${Math.min(91, Math.max(9, xPct + jitter * 0.4))}%`,
      y: Math.round(yPx + (i % 2)),
      z: (i % 6) + 1,
      s: Math.max(12, size - (i % 2)),
    };
  });
}
