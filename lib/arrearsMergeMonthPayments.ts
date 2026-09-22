import type { ArrearsLetterLineInput } from '@/app/types/arrears';
import { isMonthBookkeepingChargeLine } from '@/lib/arrearsLetterComplexity';

function norm(d: string): string {
  return String(d || '').replace(/\s+/g, '');
}

function isPaymentOnlyRow(l: {
  description?: string;
  amount?: number;
  paidAmount?: number;
}): boolean {
  const amt = Math.round(l.amount || 0);
  const paid = Math.round(l.paidAmount || 0);
  if (paid <= 0 || amt !== 0) return false;
  const d = norm(l.description || '');
  if (d && /조정|성실|법인|부가세|양수도|전기이월/.test(d)) return false;
  return true;
}

function isMonthChargeRow(l: { description?: string; amount?: number; paidAmount?: number }): boolean {
  if (Math.round(l.amount || 0) <= 0) return false;
  if (Math.round(l.paidAmount || 0) > 0) return false;
  return isMonthBookkeepingChargeLine(l.description || '', l.amount || 0);
}

/** 지급-only 줄을 바로 앞·뒤 월 기장료 줄에 붙임 (6월 양식) */
export function mergeMonthlyBookkeepingPaymentRows<
  T extends ArrearsLetterLineInput & { description: string; amount: number; paidAmount: number; paidDate?: string },
>(lines: T[]): T[] {
  if (lines.length < 2) return lines;

  const out: T[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i]!;
    if (isPaymentOnlyRow(cur) && i + 1 < lines.length) {
      const next = lines[i + 1]!;
      if (
        isMonthChargeRow(next) &&
        Math.round(next.amount) === Math.round(cur.paidAmount || 0)
      ) {
        out.push({
          ...next,
          paidAmount: Math.round(cur.paidAmount || 0),
          paidDate: cur.paidDate || next.paidDate || '',
          source: (next.source || cur.source) as T['source'],
        });
        i += 2;
        continue;
      }
    }
    if (isMonthChargeRow(cur) && i + 1 < lines.length) {
      const next = lines[i + 1]!;
      if (isPaymentOnlyRow(next) && Math.round(next.paidAmount || 0) === Math.round(cur.amount)) {
        out.push({
          ...cur,
          paidAmount: Math.round(next.paidAmount || 0),
          paidDate: next.paidDate || cur.paidDate || '',
          source: (cur.source || next.source) as T['source'],
        });
        i += 2;
        continue;
      }
    }
    out.push(cur);
    i += 1;
  }
  return out;
}
