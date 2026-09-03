/**
 * 미수 업로드 파일명 규칙 (날짜 가변)
 * - 미수수수료 거래처(잔액)현황_26.08.31.xls
 * - 거래처별 현황_20260902.xlsx
 */

export type ArrearsUploadKind = 'status' | 'client_detail';

export type ParsedArrearsUploadName = {
  kind: ArrearsUploadKind;
  /** YYYY.MM.DD */
  asOfDate: string;
  filename: string;
};

function basename(name: string): string {
  return String(name || '')
    .replace(/^.*[\\/]/, '')
    .trim();
}

/** YY.MM.DD 또는 YYYYMMDD → YYYY.MM.DD */
export function dateTokenToDotDate(token: string): string {
  const t = String(token || '').trim();
  const m1 = t.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m1) {
    const yy = Number(m1[1]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}.${m1[2]}.${m1[3]}`;
  }
  const m2 = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}.${m2[2]}.${m2[3]}`;
  const m3 = t.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})$/);
  if (m3) return `${m3[1]}.${m3[2]}.${m3[3]}`;
  return '';
}

/**
 * 파일명으로 업로드 종류·날짜 판별.
 * 맞지 않으면 null.
 */
export function parseArrearsUploadFilename(filename: string): ParsedArrearsUploadName | null {
  const name = basename(filename);
  const stem = name.replace(/\.(xlsx?|xls)$/i, '');

  // 미수수수료 거래처(잔액)현황_26.08.31
  const status = stem.match(
    /^미수수수료\s*거래처\s*\(?잔액\)?\s*현황[_\-\s]?(.+)$/i,
  ) || stem.match(/^미수수수료\s*거래처\(잔액\)현황[_\-\s]?(.+)$/);
  if (status) {
    const asOfDate = dateTokenToDotDate(status[1]!.trim());
    if (!asOfDate) return null;
    return { kind: 'status', asOfDate, filename: name };
  }
  // 느슨: 잔액현황 + 날짜
  if (/잔액\s*현황/.test(stem) && /미수/.test(stem)) {
    const tok = stem.match(/(\d{2}\.\d{2}\.\d{2}|\d{8}|\d{4}[.\-]\d{2}[.\-]\d{2})\s*$/);
    if (tok) {
      const asOfDate = dateTokenToDotDate(tok[1]!);
      if (asOfDate) return { kind: 'status', asOfDate, filename: name };
    }
  }

  // 거래처별 현황_20260902
  const detail = stem.match(/^거래처별\s*현황[_\-\s]?(.+)$/);
  if (detail) {
    const asOfDate = dateTokenToDotDate(detail[1]!.trim());
    if (!asOfDate) return null;
    return { kind: 'client_detail', asOfDate, filename: name };
  }

  return null;
}

export function assertArrearsUploadFilename(
  filename: string,
  expect: ArrearsUploadKind,
): ParsedArrearsUploadName {
  const parsed = parseArrearsUploadFilename(filename);
  if (!parsed) {
    throw new Error(
      expect === 'status'
        ? '파일명이 「미수수수료 거래처(잔액)현황_날짜」형식이어야 합니다. 예: 미수수수료 거래처(잔액)현황_26.08.31.xls'
        : '파일명이 「거래처별 현황_날짜」형식이어야 합니다. 예: 거래처별 현황_20260902.xlsx',
    );
  }
  if (parsed.kind !== expect) {
    throw new Error(
      expect === 'status'
        ? '이 칸에는 「미수수수료 거래처(잔액)현황_…」파일만 올릴 수 있습니다.'
        : '이 칸에는 「거래처별 현황_…」파일만 올릴 수 있습니다.',
    );
  }
  return parsed;
}

export const ARREARS_MANAGER_CODE_MAP: Readonly<Record<number, string>> = {
  1: '인디',
  2: '블루',
  3: '다야',
  4: '윈터',
  5: '리아',
  6: '페리',
};

/** 인디 — 거래처별 현황에 없음, 잔액은 현황표·상세는 기존 공문 */
export function isIndieManagerName(name: string | null | undefined): boolean {
  return String(name || '').trim() === '인디';
}
