/**
 * 거래처원장과 맞지 않아 수동 잔액을 유지하는 미수 행.
 * 원장 임포트 시 balance/carryIn/debit/credit 갱신을 건너뜁니다.
 */
export const ARREARS_MANUAL_BALANCE_BY_CODE: Readonly<Record<string, number>> = {
  '00183': 0, // 오프라인
  '00199': 207_301, // 하나비
};

/** 잔액 0이어도 목록에 항상 표시 (공문 조회용) */
export const ARREARS_ALWAYS_LISTED_CODES = new Set<string>(['00183']);

/** 공문 임포트 시 letter: 중복 코드 (정규화 상호) */
export const ARREARS_LETTER_DUP_CODE_BY_CANONICAL: Readonly<Record<string, string>> = {
  '00183': 'letter:오프라인',
  '00199': 'letter:하나비',
};

export function getArrearsManualBalance(externalCode: string): number | undefined {
  return ARREARS_MANUAL_BALANCE_BY_CODE[externalCode.trim()];
}

export function isArrearsBalanceLocked(externalCode: string): boolean {
  return getArrearsManualBalance(externalCode) !== undefined;
}

export function isArrearsAlwaysListed(externalCode: string): boolean {
  return ARREARS_ALWAYS_LISTED_CODES.has(externalCode.trim());
}

export function applyArrearsManualBalance<
  T extends { externalCode: string; balance: number; carryIn?: number },
>(item: T): T {
  const locked = getArrearsManualBalance(item.externalCode);
  if (locked === undefined) return item;
  return { ...item, balance: locked, carryIn: locked };
}
