import type { ClientRecord } from '@/app/types/client';

export type FeeBreakdown = {
  bookkeepingFee: number | null;
  adjustmentFee: number | null;
};

export type FeeBreakdownSave = FeeBreakdown & {
  feeSummary: number | null;
};

function parseFeeField(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function readFeeBreakdown(intakeData: Record<string, unknown> | undefined): FeeBreakdown {
  if (!intakeData) return { bookkeepingFee: null, adjustmentFee: null };
  return {
    bookkeepingFee: parseFeeField(intakeData.bookkeepingFee),
    adjustmentFee: parseFeeField(intakeData.adjustmentFee),
  };
}

/** 수수료 = 기장료(월)×12 + 조정료. 둘 다 비어 있으면 null */
export function computeFeeSummary(
  bookkeepingFee: number | null,
  adjustmentFee: number | null,
): number | null {
  const hasBookkeeping = bookkeepingFee != null && Number.isFinite(bookkeepingFee);
  const hasAdjustment = adjustmentFee != null && Number.isFinite(adjustmentFee);
  if (!hasBookkeeping && !hasAdjustment) return null;
  return (bookkeepingFee ?? 0) * 12 + (adjustmentFee ?? 0);
}

export function parseFeeInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

/** feeSummary 우선, 없으면 intake breakdown에서 계산 */
export function resolveClientFeeSummary(
  feeSummary: number | null | undefined,
  intakeData?: Record<string, unknown>,
): number | null {
  if (feeSummary != null && Number.isFinite(feeSummary)) return feeSummary;
  const { bookkeepingFee, adjustmentFee } = readFeeBreakdown(intakeData);
  return computeFeeSummary(bookkeepingFee, adjustmentFee);
}

export function resolveClientRecordFee(client: Pick<ClientRecord, 'feeSummary' | 'intakeData'>): number | null {
  return resolveClientFeeSummary(client.feeSummary, client.intakeData);
}
