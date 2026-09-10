import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

export function formatFeeAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

export function formatFeeHistorySummary(
  previousFee: number | null,
  newFee: number | null,
): string {
  return `${CLIENT_FIELD_LABELS.fee} ${formatFeeAmount(previousFee)} → ${formatFeeAmount(newFee)}`;
}

export function formatManagerHistorySummary(prev: string, next: string): string {
  const a = prev.trim() || '(미지정)';
  const b = next.trim() || '(미지정)';
  return `담당자 ${a} → ${b}`;
}
