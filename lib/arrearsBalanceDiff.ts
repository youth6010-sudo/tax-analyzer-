/** 원장잔액 vs 내역 합 차이 구분 */
export type BalanceDiffKind = 'ok' | 'mismatch' | 'ledger_only';

/**
 * 현황표 잔액 ≠ 공문·상세 Σ(금액−지급) → 불일치.
 * 공문 없고 내역합 0·잔액≠0(예전「원장만」)도 불일치로 본다.
 * `ledger_only`는 하위 호환용으로만 남기며 더 이상 반환하지 않음.
 */
export function classifyBalanceDiff(opts: {
  ledgerBalance: number;
  linesOpen: number;
  /** @deprecated 공문 유무와 관계없이 잔액≠상세합이면 불일치 */
  hasLetter?: boolean;
}): BalanceDiffKind {
  const ledgerBalance = Math.round(opts.ledgerBalance);
  const linesOpen = Math.round(opts.linesOpen);
  const diff = ledgerBalance - linesOpen;
  if (diff === 0) return 'ok';
  return 'mismatch';
}
