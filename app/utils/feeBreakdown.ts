import type { ClientRecord } from '@/app/types/client';

/** 세금계산서 품목 1줄 — 공급가액은 엑셀 원본(월 단위 항목은 연환산 시 ×12) */
export type FeeLineItem = {
  itemName: string;
  supplyAmount: number;
};

export type FeeBreakdownSave = {
  feeItems: FeeLineItem[];
  feeSummary: number | null;
};

const ANNUAL_MULTIPLIER_ITEMS = new Set(['기장수수료', '기타수수료']);

function parseFeeField(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function parseFeeLineItem(raw: unknown): FeeLineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemName = typeof o.itemName === 'string' ? o.itemName.trim() : '';
  const supplyAmount = parseFeeField(o.supplyAmount);
  if (!itemName || supplyAmount == null) return null;
  return { itemName, supplyAmount };
}

/** 기장수수료·기타수수료만 월 금액×12, 나머지 품목은 공급가액 그대로 */
export function isMonthlyAnnualFeeItem(itemName: string): boolean {
  return ANNUAL_MULTIPLIER_ITEMS.has(itemName.trim());
}

export function feeItemAnnualAmount(item: FeeLineItem): number {
  const amount = Math.round(item.supplyAmount || 0);
  return isMonthlyAnnualFeeItem(item.itemName) ? amount * 12 : amount;
}

export function readFeeItems(intakeData: Record<string, unknown> | undefined): FeeLineItem[] {
  if (!intakeData) return [];
  const raw = intakeData.feeItems;
  if (Array.isArray(raw)) {
    return raw.map(parseFeeLineItem).filter((i): i is FeeLineItem => i != null);
  }
  const legacy: FeeLineItem[] = [];
  const bookkeeping = parseFeeField(intakeData.bookkeepingFee);
  const adjustment = parseFeeField(intakeData.adjustmentFee);
  if (bookkeeping != null) legacy.push({ itemName: '기장수수료', supplyAmount: bookkeeping });
  if (adjustment != null) legacy.push({ itemName: '조정료', supplyAmount: adjustment });
  return legacy;
}

/** 품목별 연간 환산 합계. 품목 없으면 null */
export function computeFeeSummaryFromItems(items: FeeLineItem[]): number | null {
  if (!items.length) return null;
  const total = items.reduce((s, item) => s + feeItemAnnualAmount(item), 0);
  return Number.isFinite(total) ? total : null;
}

/** @deprecated readFeeItems 사용 */
export function readFeeBreakdown(intakeData: Record<string, unknown> | undefined): {
  bookkeepingFee: number | null;
  adjustmentFee: number | null;
} {
  const items = readFeeItems(intakeData);
  const bookkeeping = items.find(i => i.itemName === '기장수수료')?.supplyAmount ?? null;
  const adjustment =
    items.find(i => i.itemName !== '기장수수료' && i.itemName !== '기타수수료')?.supplyAmount ?? null;
  return { bookkeepingFee: bookkeeping, adjustmentFee: adjustment };
}

/** @deprecated computeFeeSummaryFromItems 사용 */
export function computeFeeSummary(
  bookkeepingFee: number | null,
  adjustmentFee: number | null,
): number | null {
  const items: FeeLineItem[] = [];
  if (bookkeepingFee != null) items.push({ itemName: '기장수수료', supplyAmount: bookkeepingFee });
  if (adjustmentFee != null) items.push({ itemName: '조정료', supplyAmount: adjustmentFee });
  return computeFeeSummaryFromItems(items);
}

export function parseFeeInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return n;
}

/** feeSummary 우선, 없으면 intake feeItems에서 계산 */
export function resolveClientFeeSummary(
  feeSummary: number | null | undefined,
  intakeData?: Record<string, unknown>,
): number | null {
  if (feeSummary != null && Number.isFinite(feeSummary)) return feeSummary;
  return computeFeeSummaryFromItems(readFeeItems(intakeData));
}

export function resolveClientRecordFee(client: Pick<ClientRecord, 'feeSummary' | 'intakeData'>): number | null {
  return resolveClientFeeSummary(client.feeSummary, client.intakeData);
}

export function feeItemsEqual(a: FeeLineItem[], b: FeeLineItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const other = b[i];
    return item.itemName === other.itemName && item.supplyAmount === other.supplyAmount;
  });
}

/** 엑셀보내기용 — 기장·기타(월 공급가액), 조정(합산·연환산 없음), 합계 */
export type FeeExportBuckets = {
  bookkeeping: number | '';
  etc: number | '';
  adjustment: number | '';
  total: number | '';
};

export function bucketFeeItemsForExport(items: FeeLineItem[]): FeeExportBuckets {
  let bookkeeping = 0;
  let etc = 0;
  let adjustment = 0;
  let hasBk = false;
  let hasEtc = false;
  let hasAdj = false;

  for (const item of items) {
    const name = item.itemName.trim();
    const amt = Math.round(item.supplyAmount || 0);
    if (name === '기장수수료') {
      bookkeeping += amt;
      hasBk = true;
    } else if (name === '기타수수료') {
      etc += amt;
      hasEtc = true;
    } else {
      adjustment += amt;
      hasAdj = true;
    }
  }

  const total = computeFeeSummaryFromItems(items);

  return {
    bookkeeping: hasBk ? bookkeeping : '',
    etc: hasEtc ? etc : '',
    adjustment: hasAdj ? adjustment : '',
    total: total ?? '',
  };
}
