/**
 * 미수사유: 공문 실제 청구 중 금액(미수잔여) 큰 순 최대 2개
 * 지급-only 줄은 앞쪽 미수 청구에 먼저 상계한 뒤 사유를 고른다.
 */
import { formatArrearsChargeLabel } from '@/lib/arrearsLineLabel';

export type ReasonLine = {
  description?: string | null;
  amount?: number | null;
  paidAmount?: number | null;
};

type OpenLine = {
  amount: number;
  paid: number;
  open: number;
  description: string;
  isCharge: boolean;
};

function isPaymentOnly(amount: number, paid: number, description: string): boolean {
  if (paid <= 0 || amount !== 0) return false;
  const d = String(description || '').replace(/\s+/g, '');
  if (d && /조정|성실|법인|부가세|양수도|전기이월/.test(d) && amount > 0) return false;
  return true;
}

/**
 * 지급-only·초과지급을 앞쪽 청구 미수에 FIFO 상계.
 * (벳케어·프랭크버거·기타수수료 업체처럼 7월 청구+8월 입금이 분리된 공문용)
 */
export function netReasonLinesForUnpaid(lines: ReasonLine[]): OpenLine[] {
  const rows: OpenLine[] = lines.map(l => {
    const amount = Math.round(Number(l.amount) || 0);
    const paid = Math.round(Number(l.paidAmount) || 0);
    const description = String(l.description || '').trim();
    return {
      amount,
      paid,
      open: amount - paid,
      description,
      isCharge: amount > 0,
    };
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    // 지급-only: 전액 상계 재원
    // 청구줄에 이미 붙은 초과지급(paid > amount)도 잔여를 앞·뒤 미수에 배분하지 않음 — 사유는 open>0만 봄
    if (!isPaymentOnly(row.amount, row.paid, row.description)) continue;
    let remain = row.paid;
    if (remain <= 0) continue;

    // 1) 동액 미수 청구 우선
    for (let j = 0; j < i && remain > 0; j++) {
      const ch = rows[j]!;
      if (!ch.isCharge || ch.open <= 0) continue;
      if (ch.open === remain || ch.amount === remain) {
        const use = Math.min(ch.open, remain);
        ch.open -= use;
        ch.paid += use;
        remain -= use;
      }
    }
    // 2) FIFO
    for (let j = 0; j < i && remain > 0; j++) {
      const ch = rows[j]!;
      if (!ch.isCharge || ch.open <= 0) continue;
      const use = Math.min(ch.open, remain);
      ch.open -= use;
      ch.paid += use;
      remain -= use;
    }
    row.paid = remain;
    row.open = -remain;
  }

  return rows;
}

/**
 * 미수(상계 후 open > 0) 청구만, 금액 큰 순 최대 2개 적요.
 * 내역 1개면 1개. 공문에 없는 월을 만들지 않음.
 */
export function pickArrearsReasonChargeDescs(lines: ReasonLine[]): string[] {
  const unpaid = netReasonLinesForUnpaid(lines)
    .filter(l => l.isCharge && l.open > 0 && l.description)
    .map(l => ({
      amount: l.amount,
      open: l.open,
      description: l.description,
    }));

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
