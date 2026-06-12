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
}

export interface LunchDatabase {
  updatedAt: string;
  officeLabel: string;
  spots: LunchSpot[];
}
