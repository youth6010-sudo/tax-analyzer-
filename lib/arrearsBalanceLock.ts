/**
 * 하나비·오프라인 — 상세 내역(공문) 보호.
 * 잔액은 「미수수수료 거래처(잔액)현황」기준이며, 공문과 다르면 불일치로 표시.
 */
export const ARREARS_LETTER_PROTECTED_CODES = new Set<string>(['00183', '00199']);

/** 잔액 0이어도 목록에 항상 표시 (공문 조회용) */
export const ARREARS_ALWAYS_LISTED_CODES = new Set<string>(['00183']);

/**
 * 양수도로 구·신 코드가 나뉜 업체.
 * - 공문에는 이관 적요(양수도)를 **한 줄**로 유지한다 (구계정 전체 이력 합산 금지).
 * - 신계정 공문 「미수 수수료」= 해당 현황표 잔액 + 양수도 이관액.
 * - 현황표와 공문 줄합은 구조적으로 다를 수 있음 → 불일치로 보지 않음.
 */
export const ARREARS_TRANSFER_PAIRS: ReadonlyArray<{
  oldCode: string;
  newCode: string;
  label: string;
}> = [{ oldCode: '00637', newCode: '01418', label: '천돈가 양수도' }];

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

export function getArrearsTransferPair(externalCode: string) {
  const code = String(externalCode || '').trim();
  if (!code) return null;
  return ARREARS_TRANSFER_PAIRS.find(p => p.oldCode === code || p.newCode === code) ?? null;
}

export function isArrearsTransferSplitCode(externalCode: string): boolean {
  return getArrearsTransferPair(externalCode) != null;
}

/** 공문 줄 중 「양수도」이관 청구액 합 */
export function arrearsTransferCarryAmountFromLines(
  lines: ReadonlyArray<{ description?: string | null; amount?: number | null }>,
): number {
  return lines.reduce((s, l) => {
    if (!/양수도/.test(String(l.description || ''))) return s;
    return s + Math.round(Number(l.amount) || 0);
  }, 0);
}

/**
 * 공문 「미수 수수료」·총액 잔액 표시.
 * 양수도 신계정: 현황표 잔액 + 양수도 한 줄 금액. 그 외·구계정: 현황표 잔액.
 */
export function arrearsLetterFeeBalance(
  externalCode: string,
  statusBalance: number,
  lines: ReadonlyArray<{ description?: string | null; amount?: number | null }>,
): number {
  const bal = Math.round(Number(statusBalance) || 0);
  const pair = getArrearsTransferPair(externalCode);
  if (!pair) return bal;
  if (String(externalCode || '').trim() !== pair.newCode) return bal;
  return bal + arrearsTransferCarryAmountFromLines(lines);
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
