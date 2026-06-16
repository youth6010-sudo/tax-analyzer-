import type { LunchSpot } from '@/app/types/lunch';

export interface WalkDistanceBand {
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  spotIds: string[];
  minMinutes: number;
  maxMinutes: number;
}

const BAND_EMOJI = ['🏢', '🚶', '🚶‍♂️', '🏃', '🧭'] as const;

function bandShortLabel(min: number, max: number): string {
  if (min === 0 && max <= 1) return '건물·바로앞';
  if (max <= 1) return '1분권';
  if (max <= 3) return '근거리';
  if (max <= 6) return '중거리';
  return '산책권';
}

function bandLabel(min: number, max: number, count: number): string {
  const range = min === max ? `${min}분` : `${min}~${max}분`;
  return `도보 ${range} · ${bandShortLabel(min, max)} (${count}곳)`;
}

/** walkMinutes 기준 정렬 후 거의 균등한 구간으로 나눔 */
export function buildWalkDistanceBands(spots: LunchSpot[], bucketCount = 4): WalkDistanceBand[] {
  const sorted = [...spots].sort(
    (a, b) => a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name, 'ko'),
  );
  if (sorted.length === 0) return [];

  const size = Math.ceil(sorted.length / bucketCount);
  const bands: WalkDistanceBand[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const chunk = sorted.slice(i * size, (i + 1) * size);
    if (chunk.length === 0) continue;
    const minM = chunk[0].walkMinutes;
    const maxM = chunk[chunk.length - 1].walkMinutes;
    bands.push({
      id: `walk-band-${i}`,
      label: bandLabel(minM, maxM, chunk.length),
      shortLabel: bandShortLabel(minM, maxM),
      emoji: BAND_EMOJI[i] ?? '📍',
      spotIds: chunk.map(s => s.id),
      minMinutes: minM,
      maxMinutes: maxM,
    });
  }
  return bands;
}

export function filterSpotsByDistanceBand(
  spots: LunchSpot[],
  bandId: string | 'all',
  bands: WalkDistanceBand[],
): LunchSpot[] {
  if (bandId === 'all') return spots;
  const band = bands.find(b => b.id === bandId);
  if (!band) return spots;
  const ids = new Set(band.spotIds);
  return spots.filter(s => ids.has(s.id));
}

export function spotDistanceBandLabel(spot: LunchSpot, bands: WalkDistanceBand[]): string {
  const band = bands.find(b => b.spotIds.includes(spot.id));
  if (!band) return `도보 ${spot.walkMinutes}분`;
  return band.minMinutes === band.maxMinutes
    ? `도보 ${band.minMinutes}분`
    : `도보 ${spot.walkMinutes}분`;
}
