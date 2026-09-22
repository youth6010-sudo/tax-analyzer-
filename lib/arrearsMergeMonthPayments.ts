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

/** 적요에서 YYYY-MM (또는 월만) */
function chargeYearMonth(desc: string): { y: number; m: number } | null {
  const d = norm(desc);
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return { y, m: Number(m[2]) };
}

/** 지급일시 "N월 D일" → 월 */
function paidMonth(paidDate: string): number | null {
  const pd = String(paidDate || '').replace(/\s+/g, '');
  const m = pd.match(/^(\d{1,2})월/);
  return m ? Number(m[1]) : null;
}

/** 차월: 지급월 M → 청구월 M-1 */
function prevMonth(y: number, m: number): { y: number; m: number } {
  if (m <= 1) return { y: y - 1, m: 12 };
  return { y, m: m - 1 };
}

/**
 * 지급-only 줄을 월 기장료 줄에 붙임 (6월 양식).
 * - 인접 쌍 우선
 * - 남는 지급은 차월(지급월의 직전 월 미납 기장)에 붙임
 */
export function mergeMonthlyBookkeepingPaymentRows<
  T extends ArrearsLetterLineInput & {
    description: string;
    amount: number;
    paidAmount: number;
    paidDate?: string;
  },
>(lines: T[]): T[] {
  if (lines.length < 2) return lines;

  const out: T[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i]!;

    // 이미 지급이 붙은 월 기장 바로 다음의 **동일 지급일** 동액 지급-only → 중복 제거
    // (차월 지급이 다음 달 줄 뒤에 오는 경우는 지우지 않음 — 2차 차월 부착)
    if (
      Math.round(cur.amount) > 0 &&
      Math.round(cur.paidAmount || 0) === Math.round(cur.amount) &&
      isMonthBookkeepingChargeLine(cur.description || '', cur.amount) &&
      i + 1 < lines.length
    ) {
      const next = lines[i + 1]!;
      const curPd = String(cur.paidDate || '').replace(/\s+/g, '');
      const nextPd = String(next.paidDate || '').replace(/\s+/g, '');
      if (
        isPaymentOnlyRow(next) &&
        Math.round(next.paidAmount || 0) === Math.round(cur.amount) &&
        curPd &&
        nextPd &&
        curPd === nextPd
      ) {
        out.push({
          ...cur,
          paidDate: cur.paidDate || next.paidDate || '',
        });
        i += 2;
        continue;
      }
    }

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

  // 2차: 남은 지급-only → 차월(지급월−1) 미납 기장에 붙이기
  return attachChamwolPayments(out);
}

function attachChamwolPayments<
  T extends ArrearsLetterLineInput & {
    description: string;
    amount: number;
    paidAmount: number;
    paidDate?: string;
  },
>(lines: T[]): T[] {
  const next = lines.map(l => ({ ...l }));
  const usedPay = new Set<number>();

  for (let pi = 0; pi < next.length; pi++) {
    const pay = next[pi]!;
    if (!isPaymentOnlyRow(pay)) continue;
    const pm = paidMonth(pay.paidDate || '');
    if (pm == null) continue;
    const payAmt = Math.round(pay.paidAmount || 0);

    // 지급월 기준 연도: 앞쪽 청구 줄 우선
    let refY = new Date().getFullYear();
    for (let j = pi - 1; j >= 0; j--) {
      const ym = chargeYearMonth(next[j]!.description || '');
      if (ym) {
        refY = ym.y;
        // 지급월이 청구월보다 작으면(1월 지급·12월 청구류) 연도 보정은 want에서 처리
        break;
      }
    }
    if (refY === new Date().getFullYear()) {
      for (let j = pi + 1; j < next.length; j++) {
        const ym = chargeYearMonth(next[j]!.description || '');
        if (ym) {
          refY = ym.y;
          break;
        }
      }
    }

    // 당월(지급월=청구월) 우선, 없으면 차월(지급월−1)
    const wantSame = { y: refY, m: pm };
    const wantCham = prevMonth(refY, pm);

    function findCharge(want: { y: number; m: number }): number {
      let best = -1;
      for (let ci = 0; ci < next.length; ci++) {
        if (ci === pi) continue;
        const ch = next[ci]!;
        if (!isMonthChargeRow(ch)) continue;
        if (Math.round(ch.amount) !== payAmt) continue;
        const ym = chargeYearMonth(ch.description || '');
        if (!ym) continue;
        if (ym.m === want.m && (ym.y === want.y || ym.y === want.y - 1 || ym.y === want.y + 1)) {
          if (ym.y === want.y) return ci;
          if (best < 0) best = ci;
        }
      }
      if (best >= 0) return best;
      for (let ci = pi - 1; ci >= 0; ci--) {
        const ch = next[ci]!;
        if (!isMonthChargeRow(ch)) continue;
        if (Math.round(ch.amount) !== payAmt) continue;
        const ym = chargeYearMonth(ch.description || '');
        if (ym && ym.m === want.m) return ci;
      }
      return -1;
    }

    let best = findCharge(wantSame);
    if (best < 0) best = findCharge(wantCham);

    if (best < 0) continue;
    next[best] = {
      ...next[best]!,
      paidAmount: payAmt,
      paidDate: pay.paidDate || next[best]!.paidDate || '',
      source: (next[best]!.source || pay.source) as T['source'],
    };
    usedPay.add(pi);
  }

  return next.filter((_, idx) => !usedPay.has(idx));
}

/**
 * 적요의 2자리 연도 → 4자리 (25년 → 2025년). 지급일시는 그대로.
 */
export function normalizeLetterDescriptionYears(description: string): string {
  const raw = String(description || '');
  if (!raw) return raw;
  // 「25년」「26년」등 — 이미 4자리면 유지. 앞에 숫자가 더 있으면 스킵
  return raw.replace(/(?<!\d)(\d{2})년/g, (_m, yy) => {
    const n = Number(yy);
    if (!Number.isFinite(n) || n >= 100) return `${yy}년`;
    // 70 이상은 19xx 로 보지 않음(미수 공문은 주로 2000년대). 00~69 → 20xx
    return `${2000 + n}년`;
  });
}

export function normalizeLetterLineYears<
  T extends { description?: string; amount?: number; paidAmount?: number; paidDate?: string },
>(lines: T[]): T[] {
  return lines.map(l => ({
    ...l,
    description: normalizeLetterDescriptionYears(l.description || ''),
  }));
}
