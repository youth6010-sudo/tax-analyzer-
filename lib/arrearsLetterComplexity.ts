/**
 * 공문 복잡도: 기장료만(월 롤링) vs 복잡미수(동결+9월~추가)
 */
import { linesForCurrentLetterCycle } from '@/app/types/arrears';

export type ArrearsLetterComplexity = 'empty' | 'simple_bk' | 'complex';

function norm(d: string): string {
  return String(d || '').replace(/\s+/g, '');
}

/** 공문 줄 — 월 기장료 청구(조정·성실·부가세·기타 제외) */
export function isMonthBookkeepingChargeLine(desc: string, amount: number): boolean {
  if (Math.round(amount || 0) <= 0) return false;
  const d = norm(desc);
  if (!d) return false;
  if (/전기이월|원장반영|입금|취소|반환/.test(d)) return false;
  if (/조정|성실|부가세|양수도|선수금|기타/.test(d)) return false;
  if (/(20\d{2}|\d{2})년\d{1,2}월/.test(d)) return true;
  if (/^\d{1,2}월/.test(d) && /기장|수수료/.test(d)) return true;
  if (/^\d{1,2}월$/.test(d)) return true;
  return false;
}

/** 월 기타수수료 청구(기장 패키지와 함께 차월 취급) */
export function isMonthOtherFeeChargeLine(desc: string, amount: number): boolean {
  if (Math.round(amount || 0) <= 0) return false;
  const d = norm(desc);
  if (!d) return false;
  if (!/기타/.test(d)) return false;
  return /(20\d{2}|\d{2})년.*\d{1,2}월|\d{1,2}월/.test(d);
}

export function isPaymentLikeLine(l: {
  description?: string;
  amount?: number;
  paidAmount?: number;
}): boolean {
  const paid = Math.round(l.paidAmount || 0);
  const amt = Math.round(l.amount || 0);
  if (paid > 0 && amt === 0) return true;
  const d = norm(l.description || '');
  if (/입금|회수|대체/.test(d) && paid > 0) return true;
  return false;
}

/**
 * 현재 미수 사이클 기준 미납 기장·기타 월 키 (YYYY-MM).
 * 입금으로 청산된 이전 사이클은 제외.
 */
type LineLike = { description: string; amount: number; paidAmount?: number };

function withPaid(lines: LineLike[]) {
  return lines.map(l => ({
    ...l,
    paidAmount: Math.round(l.paidAmount || 0),
  }));
}

export function unpaidMonthKeys(lines: LineLike[]): Set<string> {
  const keys = new Set<string>();
  const cycle = linesForCurrentLetterCycle(withPaid(lines));
  for (const l of cycle) {
    const open = Math.round(l.amount) - Math.round(l.paidAmount || 0);
    if (open <= 0) continue;
    const bk =
      isMonthBookkeepingChargeLine(l.description, l.amount) ||
      isMonthOtherFeeChargeLine(l.description, l.amount);
    if (!bk) continue;
    const d = norm(l.description);
    const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
    if (!m) continue;
    let y = Number(m[1]);
    if (y < 100) y += 2000;
    const mo = String(Number(m[2])).padStart(2, '0');
    keys.add(`${y}-${mo}`);
  }
  return keys;
}

/** 조정·성실·부가세·법인 등 비기장 미수 — 현재 사이클 기준 */
export function hasNonBookkeepingArrearsContent(lines: LineLike[]): boolean {
  const cycle = linesForCurrentLetterCycle(withPaid(lines));
  for (const l of cycle) {
    const d = norm(l.description);
    if (!d && Math.round(l.paidAmount || 0) > 0) continue;
    if (isPaymentLikeLine(l)) continue;
    if (isMonthBookkeepingChargeLine(l.description, l.amount)) continue;
    if (isMonthOtherFeeChargeLine(l.description, l.amount)) continue;
    if (/전기이월|원장반영|현황맞춤|말잔맞춤|선수금/.test(d)) {
      if (/선수금|전기이월/.test(d)) return true;
      continue;
    }
    if (/조정|성실|부가세|법인|양수도/.test(d)) return true;
    if (Math.round(l.amount) - Math.round(l.paidAmount || 0) > 0) return true;
  }
  return false;
}

/**
 * - empty: 줄 없음
 * - simple_bk: 기장·기타수수료만 미수, 미납 월 ≤ 1 → 업로드 시 월 롤링 허용
 * - complex: 2개월↑ 기장 밀림 또는 조정료 등 포함 → 고정 + 9월~만 추가
 */
export function classifyArrearsLetterComplexity(
  lines: LineLike[],
  _ledgerBalance?: number,
): ArrearsLetterComplexity {
  if (!lines.length) return 'empty';
  if (hasNonBookkeepingArrearsContent(lines)) return 'complex';
  const months = unpaidMonthKeys(lines);
  if (months.size >= 2) return 'complex';
  const cycle = linesForCurrentLetterCycle(withPaid(lines));
  const onlyBkPay = cycle.every(l => {
    if (isPaymentLikeLine(l)) return true;
    if (isMonthBookkeepingChargeLine(l.description, l.amount)) return true;
    if (isMonthOtherFeeChargeLine(l.description, l.amount)) return true;
    const d = norm(l.description);
    if (!d && Math.round(l.paidAmount || 0) > 0) return true;
    return false;
  });
  if (onlyBkPay) return 'simple_bk';
  return 'complex';
}
