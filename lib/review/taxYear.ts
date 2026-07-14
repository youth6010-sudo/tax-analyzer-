import type { ReviewAccessConfig } from '@/lib/review/access';
import { reviewAccessConfig } from '@/lib/review/accessConfig';

/** 현재 적재된 결산 자료 귀속연도 */
export const DEFAULT_REVIEW_TAX_YEAR = 2025;

export const REVIEW_TAX_YEARS = [2024, 2025, 2026, 2027] as const;

export type ReviewTaxYear = (typeof REVIEW_TAX_YEARS)[number];

export function normalizeReviewTaxYear(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_REVIEW_TAX_YEAR;
  if ((REVIEW_TAX_YEARS as readonly number[]).includes(n)) return n;
  if (n >= 2020 && n <= 2035) return n;
  return DEFAULT_REVIEW_TAX_YEAR;
}

function yearShort(year: number): string {
  return String(year % 100).padStart(2, '0');
}

/**
 * accessConfig 시트명을 선택한 귀속연도에 맞게 치환.
 * 예: 종소세 25년 페리 → 종소세 26년 페리, 법인세 조정료25 → 조정료26
 * 법인세(26.3) 버전칩은 귀속연도+1년 신고 관례를 반영해 기본만 유지하고,
 * 다른 연도는 (yy+1).3 패턴으로 시도한다.
 */
export function accessConfigForTaxYear(
  year: number,
  base: ReviewAccessConfig = reviewAccessConfig,
): ReviewAccessConfig {
  const yy = yearShort(year);
  const corpYy = yearShort(year + 1);

  const sheetMap: ReviewAccessConfig['sheetMap'] = {};
  for (const [owner, map] of Object.entries(base.sheetMap)) {
    sheetMap[owner] = {
      ...map,
      income: map.income
        ? map.income.replace(/종소세\s*\d{2}년/, `종소세 ${yy}년`)
        : map.income,
    };
  }

  const corpTaxVersions =
    year === DEFAULT_REVIEW_TAX_YEAR
      ? base.corpTaxVersions.map(v => ({ ...v }))
      : [
          {
            id: `${corpYy}.3`,
            sheet: `법인세(${corpYy}.3)`,
          },
        ];

  return {
    ...base,
    sheetMap,
    corpSheet: corpTaxVersions[0]?.sheet || base.corpSheet,
    corpTaxVersions,
    corpFeeSheet: base.corpFeeSheet.replace(/조정료\d{2}/, `조정료${yy}`),
  };
}
