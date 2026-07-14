import { reviewAccessConfig } from '@/lib/review/accessConfig';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { canUseIndieFeatures, isDataViewer } from '@/lib/masterAccess';
import { accessConfigForTaxYear, DEFAULT_REVIEW_TAX_YEAR } from '@/lib/review/taxYear';
import type { SessionUser } from '@/lib/session';

export type ReviewSheetMapping = {
  income?: string;
  corpCols?: [number, number];
};

export type ReviewAccessConfig = {
  masters: string[];
  staff: string[];
  sheetMap: Record<string, ReviewSheetMapping>;
  corpSheet: string;
  corpTaxVersions: { id: string; sheet: string }[];
  corpFeeSheet: string;
  incomeOrder: string[];
};

export const reviewAccess = reviewAccessConfig;

type ReviewAccessUser =
  | (Pick<SessionUser, 'loginId'> & Partial<Pick<SessionUser, 'role' | 'adminMode'>>)
  | null
  | undefined;

/** 전 시트 본문 편집 — 결재권자(인디) + 개발자 */
export function isReviewMaster(user: ReviewAccessUser): boolean {
  return isDataViewer(user);
}

/** 제목행·열 구성 — 인디 + 개발자 */
export function isReviewIndie(user: ReviewAccessUser): boolean {
  return canUseIndieFeatures(user);
}

export function allReviewOwners(access: ReviewAccessConfig = reviewAccess): string[] {
  return [...new Set([...access.staff, ...access.masters])];
}

/** 포털 세션 사용자 → 검토표 담당자 키 (블루, 찰리 등) */
export function resolveReviewOwner(
  user: Pick<SessionUser, 'name'>,
  access: ReviewAccessConfig = reviewAccess,
): string {
  const owners = allReviewOwners(access);
  const name = user.name?.trim() ?? '';
  if (owners.includes(name)) return name;

  for (const match of getManagerMatchNames(name)) {
    if (owners.includes(match)) return match;
  }
  return name;
}

export function staffCanEditReview(
  reviewOwner: string,
  access: ReviewAccessConfig = reviewAccess,
): boolean {
  const map = access.sheetMap[reviewOwner];
  if (!map) return false;
  return !!(map.income || (map.corpCols && map.corpCols.length === 2));
}

/** 담당자가 패치할 수 있는 시트 이름 (종소세 본인 시트 + 법인 공통 시트) */
export function getEditableSheetNamesForOwner(
  reviewOwner: string,
  access: ReviewAccessConfig = reviewAccess,
): string[] {
  const names: string[] = [];
  const map = access.sheetMap[reviewOwner];
  if (!map) return names;
  if (map.income) names.push(map.income);
  if (map.corpCols && map.corpCols.length === 2) {
    if (access.corpSheet) names.push(access.corpSheet);
    if (access.corpFeeSheet) names.push(access.corpFeeSheet);
    for (const ver of access.corpTaxVersions || []) {
      if (ver.sheet) names.push(ver.sheet);
    }
  }
  return names;
}

export function getReviewAccessForUser(
  user: SessionUser,
  taxYear: number = DEFAULT_REVIEW_TAX_YEAR,
) {
  const access = accessConfigForTaxYear(taxYear);
  const reviewOwner = resolveReviewOwner(user, access);
  const isMaster = isReviewMaster(user);
  const isIndie = isReviewIndie(user);
  const sheetMapping = access.sheetMap[reviewOwner] ?? null;

  return {
    reviewOwner,
    isMaster,
    isIndie,
    taxYear,
    access,
    sheetMapping,
    /** 본문(데이터) 셀 — 담당자 · 결재권자 · 개발자 */
    canEdit: isMaster || staffCanEditReview(reviewOwner, access),
    /** 제목행·열 순서 — 인디 · 개발자 */
    canEditLayout: isIndie,
  };
}
