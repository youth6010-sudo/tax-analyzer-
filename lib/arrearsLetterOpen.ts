/**
 * 현황표 잔액 vs 공문합 — 업체별로 공문 줄 중 대사에서 제외할 행
 */
export function isLineExcludedFromStatusOpen(
  externalCode: string,
  line: { description?: string; amount?: number; paidAmount?: number; paidDate?: string },
): boolean {
  const code = String(externalCode || '').trim();
  const pay = Math.round(line.paidAmount || 0);
  const pd = String(line.paidDate || '').replace(/\s+/g, '');
  const desc = String(line.description || '').trim();

  /** 올바릇: 기장 미수 없음 — 9/15 24.2만 입금은 공문에 보이되 잔액 대사에서 제외(불일치) */
  if (code === '01206') {
    if (!desc && pay === 242000 && /9월15/.test(pd)) return true;
  }
  return false;
}

export function letterOpenForStatusMatch(
  externalCode: string,
  lines: Array<{ description?: string; amount: number; paidAmount?: number; paidDate?: string }>,
): number {
  return lines.reduce((sum, l) => {
    if (isLineExcludedFromStatusOpen(externalCode, l)) return sum;
    return sum + Math.round(l.amount) - Math.round(l.paidAmount || 0);
  }, 0);
}
