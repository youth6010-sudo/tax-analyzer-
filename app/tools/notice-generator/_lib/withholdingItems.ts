import type { WithholdingItem, WithholdingItemKey } from './types';

/** 원천세 납부서 3장 이상일 때 선택 가능한 본세 항목 (지방소득세는 별도 고정) */
export const WITHHOLDING_ITEM_KEYS: WithholdingItemKey[] = [
  'earned',
  'business',
  'other',
  'retirement',
  'interest',
  'dividend',
];

export const WITHHOLDING_ITEM_LABELS: Record<WithholdingItemKey, string> = {
  earned: '근로소득세',
  business: '사업소득세',
  other: '기타소득세',
  retirement: '퇴직소득세',
  interest: '법인세(이자)',
  dividend: '배당소득세',
};

export const WITHHOLDING_BREAKDOWN_MIN_SLIPS = 3;

export function usesWithholdingBreakdown(slips: number): boolean {
  return Math.max(0, Math.round(slips || 0)) >= WITHHOLDING_BREAKDOWN_MIN_SLIPS;
}

export function defaultWithholdingItems(): WithholdingItem[] {
  return WITHHOLDING_ITEM_KEYS.map(key => ({ key, enabled: false, amount: 0 }));
}

export function ensureWithholdingItems(items?: WithholdingItem[]): WithholdingItem[] {
  const byKey = new Map((items ?? []).map(item => [item.key, item]));
  return WITHHOLDING_ITEM_KEYS.map(
    key => byKey.get(key) ?? { key, enabled: false, amount: 0 },
  );
}
