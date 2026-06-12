import type { LunchDatabase } from '../types/lunch';

let cached: LunchDatabase | null = null;

export async function loadLunchDatabase(): Promise<LunchDatabase> {
  if (cached) return cached;
  const res = await fetch('/data/lunch-spots.json');
  if (!res.ok) throw new Error('맛집 데이터를 불러오지 못했습니다.');
  cached = (await res.json()) as LunchDatabase;
  return cached;
}
