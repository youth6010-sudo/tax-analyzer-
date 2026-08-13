/** 원장잔액 vs 내역 합 차이 구분 */
export type BalanceDiffKind = 'ok' | 'mismatch' | 'ledger_only';

/** 공문 없고 내역합 0·원장잔액≠0 → 장기미수(원장 유지). 그 외 차이 → 불일치 */
export function classifyBalanceDiff(opts: {
  ledgerBalance: number;
  linesOpen: number;
  hasLetter: boolean;
}): BalanceDiffKind {
  const ledgerBalance = Math.round(opts.ledgerBalance);
  const linesOpen = Math.round(opts.linesOpen);
  const diff = ledgerBalance - linesOpen;
  if (diff === 0) return 'ok';
  if (!opts.hasLetter && linesOpen === 0 && ledgerBalance !== 0) return 'ledger_only';
  return 'mismatch';
}
