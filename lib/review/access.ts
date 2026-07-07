import { reviewAccessConfig } from '@/lib/review/accessConfig';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
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

const REVIEW_MASTER_LOGIN_IDS = new Set(['charlie', 'indie']);

export function isReviewMaster(user: Pick<SessionUser, 'loginId'> | null | undefined): boolean {
  const loginId = user?.loginId?.trim().toLowerCase() ?? '';
  return REVIEW_MASTER_LOGIN_IDS.has(loginId);
}

export function allReviewOwners(): string[] {
  return [...new Set([...reviewAccess.staff, ...reviewAccess.masters])];
}

/** 포털 세션 사용자 → 검토표 담당자 키 (블루, 찰리 등) */
export function resolveReviewOwner(user: Pick<SessionUser, 'name'>): string {
  const owners = allReviewOwners();
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

export function getReviewAccessForUser(user: SessionUser) {
  const reviewOwner = resolveReviewOwner(user);
  const isMaster = isReviewMaster(user);
  const sheetMapping = reviewAccess.sheetMap[reviewOwner] ?? null;

  return {
    reviewOwner,
    isMaster,
    access: reviewAccess,
    sheetMapping,
    canEdit: isMaster || staffCanEditReview(reviewOwner),
  };
}
