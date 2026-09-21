/** 원장잔액 vs 내역 합 차이 구분 */
export type BalanceDiffKind = 'ok' | 'mismatch' | 'ledger_only';

/**
 * 현황표 잔액 ≠ 공문·상세 Σ(금액−지급) → 불일치.
 * 잔액이 마이너스이고 상세합 0(공문 없음)이면 「원장만」— 음수 잔액은 세부내역을 두지 않음.
 * 그 외 상세합 0·잔액≠0(양수 등)은 불일치로 두어 원인 확인하게 함.
 */
export function classifyBalanceDiff(opts: {
  ledgerBalance: number;
  linesOpen: number;
  /** @deprecated 공문 유무와 관계없이 잔액≠상세합이면 불일치(음수 원장만 제외) */
  hasLetter?: boolean;
}): BalanceDiffKind {
  const ledgerBalance = Math.round(opts.ledgerBalance);
  const linesOpen = Math.round(opts.linesOpen);
  const diff = ledgerBalance - linesOpen;
  if (diff === 0) return 'ok';
  if (linesOpen === 0 && ledgerBalance < 0) return 'ledger_only';
  return 'mismatch';
}
