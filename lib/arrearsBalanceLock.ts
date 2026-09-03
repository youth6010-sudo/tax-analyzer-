/**
 * 하나비·오프라인 — 상세 내역(공문) 보호.
 * 잔액은 「미수수수료 거래처(잔액)현황」기준이며, 공문과 다르면 불일치로 표시.
 */
export const ARREARS_LETTER_PROTECTED_CODES = new Set<string>(['00183', '00199']);

/** 잔액 0이어도 목록에 항상 표시 (공문 조회용) */
export const ARREARS_ALWAYS_LISTED_CODES = new Set<string>(['00183']);

/** 공문 임포트 시 letter: 중복 코드 (정규화 상호) */
export const ARREARS_LETTER_DUP_CODE_BY_CANONICAL: Readonly<Record<string, string>> = {
  '00183': 'letter:오프라인',
  '00199': 'letter:하나비',
};

/** @deprecated 잔액은 현황표 기준. 하위 호환용 빈맵 */
export const ARREARS_MANUAL_BALANCE_BY_CODE: Readonly<Record<string, number>> = {};

export function getArrearsManualBalance(_externalCode: string): number | undefined {
  return undefined;
}

export function isArrearsBalanceLocked(externalCode: string): boolean {
  // 원장 import 시에도 현황표 잔액을 덮지 않도록 보호 코드는 잠금으로 취급
  return isArrearsLetterProtected(externalCode);
}

export function isArrearsLetterProtected(externalCode: string): boolean {
  return ARREARS_LETTER_PROTECTED_CODES.has(externalCode.trim());
}

export function isArrearsAlwaysListed(externalCode: string): boolean {
  return ARREARS_ALWAYS_LISTED_CODES.has(externalCode.trim());
}

/** DTO 잔액은 DB(현황표) 그대로 — 공문과 불일치 시 배지로 표시 */
export function applyArrearsManualBalance<
  T extends { externalCode: string; balance: number; carryIn?: number },
>(item: T): T {
  return item;
}
