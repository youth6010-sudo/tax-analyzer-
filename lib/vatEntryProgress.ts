import type { ClientRecord } from '@/app/types/client';

/** 부가세 자료입력 진행도 — 세목 기간별 */
export const VAT_PROGRESS_MARKS = ['', 'O', 'X', '△'] as const;
export type VatProgressMark = (typeof VAT_PROGRESS_MARKS)[number];

export const VAT_PROGRESS_COLORS = ['', '#BFDBFE', '#FEF08A', '#BBF7D0', '#FBCFE8'] as const;

export type VatProgressCell = {
  mark?: VatProgressMark | string;
  bg?: string;
};

/** 항상 표시되는 자료 열 (불공제·신용매출 등은 해당 시에만) */
export const VAT_PROGRESS_ALWAYS_KEYS = [
  'taxInvoice',
  'invoice',
  'card',
  'cashReceipt',
  'otherEvidence',
] as const;

export type VatProgressAlwaysKey = (typeof VAT_PROGRESS_ALWAYS_KEYS)[number];

/** 조건부 열 — 표시 순서: 계산서 다음 불공제, 이후 신용매출·영세율·통장 */
export const VAT_PROGRESS_OPTIONAL_KEYS = [
  'nonDeductible',
  'agencySales',
  'zeroRateSales',
  'bankStatement',
] as const;
export type VatProgressOptionalKey = (typeof VAT_PROGRESS_OPTIONAL_KEYS)[number];

export type VatProgressItemKey = VatProgressAlwaysKey | VatProgressOptionalKey;

/** @deprecated 호환 — ALWAYS + 조건부는 visibleVatProgressKeys 사용 */
export const VAT_PROGRESS_CORE_KEYS = VAT_PROGRESS_ALWAYS_KEYS;

export const VAT_PROGRESS_LABELS: Record<VatProgressItemKey, string> = {
  taxInvoice: '세금계산서',
  invoice: '계산서',
  nonDeductible: '불공제',
  card: '카드',
  cashReceipt: '현금영수증',
  otherEvidence: '기타증빙',
  agencySales: '신용매출',
  zeroRateSales: '영세율매출',
  bankStatement: '통장내역',
};

export type VatMaterialFlags = {
  agencySales: boolean;
  zeroRateSales: boolean;
  nonDeductible: boolean;
};

export type VatPeriodProgress = Partial<Record<VatProgressItemKey, VatProgressCell>>;

export type VatEntryProgressMap = Record<string, VatPeriodProgress>;

export function vatProgressPeriodKey(year: number, vatPhase: string): string {
  return `${year}:${vatPhase}`;
}

export function readVatMaterialFlags(
  intakeData: Record<string, unknown> | null | undefined,
): VatMaterialFlags {
  const raw = intakeData?.vatMaterialFlags;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { agencySales: false, zeroRateSales: false, nonDeductible: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    agencySales: o.agencySales === true,
    zeroRateSales: o.zeroRateSales === true,
    nonDeductible: o.nonDeductible === true,
  };
}

export function readVatPeriodProgress(
  intakeData: Record<string, unknown> | null | undefined,
  periodKey: string,
): VatPeriodProgress {
  const raw = intakeData?.vatEntryProgress;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entry = (raw as VatEntryProgressMap)[periodKey];
  if (!entry || typeof entry !== 'object') return {};
  return { ...entry };
}

export function cycleVatMark(current: string | undefined): VatProgressMark {
  const cur = (current || '') as VatProgressMark;
  const idx = VAT_PROGRESS_MARKS.indexOf(cur);
  return VAT_PROGRESS_MARKS[(idx + 1) % VAT_PROGRESS_MARKS.length];
}

export function cycleVatColor(current: string | undefined): string {
  const cur = current || '';
  const idx = (VAT_PROGRESS_COLORS as readonly string[]).indexOf(cur);
  return VAT_PROGRESS_COLORS[(idx + 1) % VAT_PROGRESS_COLORS.length];
}

function isCorporateEntity(client: Pick<ClientRecord, 'businessEntityType'>): boolean {
  return client.businessEntityType === 'corporate';
}

/**
 * 표시 순서: 세금계산서 → 계산서 → (불공제) → 카드 → 현금영수증 → 기타증빙
 * → (신용매출) → (영세율) → (통장·법인)
 */
export function visibleVatProgressKeys(
  client: Pick<ClientRecord, 'businessEntityType' | 'intakeData'>,
): VatProgressItemKey[] {
  const flags = readVatMaterialFlags(client.intakeData);
  const keys: VatProgressItemKey[] = ['taxInvoice', 'invoice'];
  if (flags.nonDeductible) keys.push('nonDeductible');
  keys.push('card', 'cashReceipt', 'otherEvidence');
  if (flags.agencySales) keys.push('agencySales');
  if (flags.zeroRateSales) keys.push('zeroRateSales');
  if (isCorporateEntity(client)) keys.push('bankStatement');
  return keys;
}

export function mergeVatPeriodProgressPatch(
  intakeData: Record<string, unknown>,
  periodKey: string,
  patch: VatPeriodProgress,
): Record<string, unknown> {
  const prevMap =
    intakeData.vatEntryProgress && typeof intakeData.vatEntryProgress === 'object'
      ? ({ ...(intakeData.vatEntryProgress as VatEntryProgressMap) } as VatEntryProgressMap)
      : ({} as VatEntryProgressMap);
  const prev = { ...(prevMap[periodKey] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as VatProgressItemKey;
    if (!v || (!v.mark && !v.bg)) delete prev[key];
    else prev[key] = { mark: v.mark || '', bg: v.bg || '' };
  }
  prevMap[periodKey] = prev;
  return { ...intakeData, vatEntryProgress: prevMap };
}

/** 셀에 입력(체크·색)이 있으면 완료로 집계 */
export function isVatProgressCellFilled(cell: VatProgressCell | undefined): boolean {
  if (!cell) return false;
  return Boolean((cell.mark && String(cell.mark).trim()) || (cell.bg && String(cell.bg).trim()));
}

export function summarizeVatPeriodProgress(
  progress: VatPeriodProgress,
  keys: readonly VatProgressItemKey[],
): { done: number; total: number; filledLabels: string[] } {
  let done = 0;
  const filledLabels: string[] = [];
  for (const key of keys) {
    if (isVatProgressCellFilled(progress[key])) {
      done += 1;
      filledLabels.push(VAT_PROGRESS_LABELS[key]);
    }
  }
  return { done, total: keys.length, filledLabels };
}
