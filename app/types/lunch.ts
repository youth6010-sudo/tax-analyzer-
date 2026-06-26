export const LUNCH_CATEGORIES = [
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '카페',
  '기타',
] as const;

export type LunchCategory = (typeof LUNCH_CATEGORIES)[number];

export interface LunchSpot {
  id: string;
  name: string;
  category: LunchCategory;
  tags: string[];
  priceRange: string;
  walkMinutes: number;
  naverMapUrl: string;
  kakaoMapUrl: string;
  menuHints: string[];
  notes?: string;
  /** 가챠/추첨 풀에 포함할지 여부. 기존 등록 식당은 true, 자동 수집된 주변 식당은 false. */
  active: boolean;
}

export interface LunchDatabase {
  updatedAt: string;
  officeLabel: string;
  spots: LunchSpot[];
}
