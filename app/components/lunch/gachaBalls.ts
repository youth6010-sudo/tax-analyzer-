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

export const BALL_PALETTE = [
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
] as const;

export type BallStyle = (typeof BALL_PALETTE)[number] & { num: string };

export function ballFromPalette(colorIndex: number, num: string): BallStyle {
  const base = BALL_PALETTE[colorIndex % BALL_PALETTE.length];
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
