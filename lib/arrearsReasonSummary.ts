/**
 * 미수사유: 공문 실제 청구 중 금액(미수잔여) 큰 순 최대 2개
 */
import { formatArrearsChargeLabel } from '@/lib/arrearsLineLabel';

export type ReasonLine = {
  description?: string | null;
  amount?: number | null;
  paidAmount?: number | null;
};

/**
 * 미수(금액−지급 > 0) 청구만, 금액 큰 순 최대 2개 적요.
 * 내역 1개면 1개. 공문에 없는 월을 만들지 않음.
 */
export function pickArrearsReasonChargeDescs(lines: ReasonLine[]): string[] {
  const unpaid = lines
    .map(l => {
      const amount = Math.round(Number(l.amount) || 0);
      const paid = Math.round(Number(l.paidAmount) || 0);
      const open = amount - paid;
      const description = String(l.description || '').trim();
      return { amount, open, description };
    })
    .filter(l => l.open > 0 && l.description && l.amount > 0);

  unpaid.sort((a, b) => b.amount - a.amount || b.open - a.open);

  const out: string[] = [];
  for (const l of unpaid) {
    if (out.includes(l.description)) continue;
    out.push(l.description);
    if (out.length >= 2) break;
  }
  return out;
}

export function formatArrearsReasonSummary(
  lines: ReasonLine[],
  opts?: { asOfDate?: string | null; memo?: string | null; useRawDesc?: boolean },
): string {
  const descs = pickArrearsReasonChargeDescs(lines);
  if (!descs.length) {
    const memo = String(opts?.memo || '').trim();
    return memo || '—';
  }
  if (opts?.useRawDesc) return descs.join(' · ');
  return descs
    .map((desc, i) =>
      formatArrearsChargeLabel(desc, {
        asOfDate: opts?.asOfDate,
        prevDescription: i > 0 ? descs[i - 1] : undefined,
      }),
    )
    .join(' · ');
}
