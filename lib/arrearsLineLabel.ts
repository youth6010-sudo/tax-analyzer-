/**
 * 미수 내역 적요·지급일 — 포털 표시용 통일 포맷
 * (공문 엑셀/인쇄는 별도 변환기로 사무실 형식 유지)
 */

export type ArrearsLineLabelCtx = {
  /** letterDate 또는 asOfDate (YYYY-MM-DD / YYYY.MM.DD) */
  asOfDate?: string | null;
  prevDescription?: string | null;
  /**
   * 기장료(월) 사이에 끼인 비기장 항목 — 표시에서 연도 제거
   * (예: 16년 5월 → 16년 조정수수료 → 16년 6월  ⇒  조정수수료)
   */
  stripYear?: boolean;
};

function parseAsOfParts(asOf?: string | null): { year: number; month: number } | null {
  const s = String(asOf || '').trim();
  if (!s) return null;
  const m =
    s.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/) ||
    s.match(/^(\d{4})[.\-](\d{2})$/) ||
    s.match(/^(\d{4})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 12;
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  return { year, month: Number.isFinite(month) ? month : 12 };
}

function expandYy(yy: number): number {
  if (yy >= 100) return yy;
  return 2000 + yy;
}

/** 연도 없는 월 → asOf 기준 연도 (월이 asOf월보다 크면 전년) */
export function inferYearForMonth(month: number, ctx?: ArrearsLineLabelCtx): number {
  const asOf = parseAsOfParts(ctx?.asOfDate);
  const now = new Date();
  const baseYear = asOf?.year ?? now.getFullYear();
  const baseMonth = asOf?.month ?? now.getMonth() + 1;
  if (month > baseMonth) return baseYear - 1;
  return baseYear;
}

function yearFromPrevDescription(prev?: string | null): number | null {
  const p = String(prev || '').replace(/\s+/g, '');
  const m = p.match(/(20\d{2}|\d{2})년/);
  if (!m) return null;
  return expandYy(Number(m[1]));
}

function compactDesc(description: string): string {
  return String(description || '').replace(/\s+/g, '');
}

/** 조정·성실·고문 등 월 기장이 아닌 청구 품목 */
export function isNonMonthlyChargeDesc(description: string): boolean {
  const d = compactDesc(description);
  if (!d) return false;
  if (/입금|취소|반환|전기이월|원장반영/.test(d)) return false;
  if (/개인조정|세무조정|법인조정|조정료|조정수수료|성실|고문수수료/.test(d)) return true;
  if (/조정/.test(d) && !/\d{1,2}월$/.test(d) && !/(20\d{2}|\d{2})년\d{1,2}월$/.test(d)) {
    return true;
  }
  return false;
}

/** 월 기장·「N년 N월」 스타일 (조정·성실 제외) */
export function isMonthlyBookkeepingDesc(description: string): boolean {
  const d = compactDesc(description);
  if (!d) return false;
  if (isNonMonthlyChargeDesc(description)) return false;
  if (/입금|취소|반환|전기이월|원장반영/.test(d)) return false;
  if (/부가세/.test(d)) return false;
  return (
    /(20\d{2}|\d{2})년\d{1,2}월/.test(d) ||
    /^\d{1,2}월/.test(d) ||
    /기장/.test(d)
  );
}

/** 표시용 — 앞쪽 연도(·월 -) 제거 */
export function stripChargeYearPrefix(description: string): string {
  let s = String(description || '').trim();
  if (!s) return '';
  s = s.replace(/^(20\d{2}|\d{2})년\s*/, '');
  // 「3월 - 법인조정료」→「법인조정료」
  if (isNonMonthlyChargeDesc(s) || isNonMonthlyChargeDesc(description)) {
    s = s.replace(/^\d{1,2}월\s*[-–—:]?\s*/, '');
  }
  return s.trim() || String(description || '').trim();
}

/**
 * 청구 적요 → `2026년 7월 기장료` 등 (월 기장 위주)
 * - 성실/조정: 원문에 연도 없으면 붙이지 않음
 * - 부가세: 연도 없이 (`7월 부가세` / `부가세`)
 * - stripYear: 기장료 사이 끼인 항목은 연도 없이
 */
export function formatArrearsChargeLabel(
  description: string,
  ctx?: ArrearsLineLabelCtx,
): string {
  const raw = String(description || '').trim();
  if (!raw) return '';
  // 「26년 8월만」등 — 끝의 ‘만’은 표기 잔재로 보고 제거 후 정규화
  const d = compactDesc(raw).replace(/만$/u, '');

  if (/^전기이월/.test(d) || d === '원장반영') {
    const y =
      yearFromPrevDescription(ctx?.prevDescription) ??
      parseAsOfParts(ctx?.asOfDate)?.year;
    return y ? `${y}년 전기이월` : '전기이월';
  }

  if (/성실/.test(d)) {
    if (ctx?.stripYear) return '성실신고수수료';
    // 원문에 연도 있을 때만 유지 — asOf로 임의 부여하지 않음
    const yearMatch = d.match(/(20\d{2}|\d{2})년/) || d.match(/^(20\d{2}|\d{2})(?!\d)/);
    if (yearMatch) {
      return `${expandYy(Number(yearMatch[1]))}년 성실신고수수료`;
    }
    return '성실신고수수료';
  }

  if (
    /개인조정|세무조정|법인조정|조정료|조정수수료|고문수수료/.test(d) ||
    (/조정/.test(d) && !/\d{1,2}월$/.test(d) && !/(20\d{2}|\d{2})년\d{1,2}월$/.test(d))
  ) {
    if (ctx?.stripYear) return stripChargeYearPrefix(raw);
    // 조정료만 있는 공문 등 — 원문에 연도 있으면 그대로
    return raw;
  }

  if (/부가세/.test(d)) {
    const withYearMonth = d.match(/(20\d{2}|\d{2})년.*?(\d{1,2})월/);
    const monthOnly = d.match(/(\d{1,2})월/);
    const month = withYearMonth
      ? Number(withYearMonth[2])
      : monthOnly
        ? Number(monthOnly[1])
        : null;
    const shop = d
      .replace(/^.*부가세(?:신고)?[-:]?/i, '')
      .replace(/신고/g, '')
      .replace(/(20\d{2}|\d{2})년/g, '')
      .replace(/\d{1,2}월/g, '');
    const base = month ? `${month}월 부가세` : '부가세';
    return shop ? `${base}-${shop}` : base;
  }

  // 기타수수료 N월 / N월 기타
  if (/기타/.test(d)) {
    const withYear = d.match(/(20\d{2}|\d{2})년.*?(\d{1,2})월/);
    const monthOnly = d.match(/(\d{1,2})월/);
    if (withYear) {
      return `${expandYy(Number(withYear[1]))}년 ${Number(withYear[2])}월 기타수수료`;
    }
    if (monthOnly) {
      const month = Number(monthOnly[1]);
      const year =
        yearFromPrevDescription(ctx?.prevDescription) ??
        inferYearForMonth(month, ctx);
      return `${year}년 ${month}월 기타수수료`;
    }
  }

  // 기장 / 월 수수료 / 「26년 7월」「7월 기장수수료」
  const withYearMonth = d.match(/(20\d{2}|\d{2})년.*?(\d{1,2})월/);
  const monthFee = d.match(/(\d{1,2})월/);
  const looksLikeMonthFee =
    /기장|수수료/.test(d) ||
    /(?:20)?\d{2}년\d{1,2}월$/.test(d) ||
    /^\d{1,2}월$/.test(d) ||
    (/^\d{1,2}월/.test(d) && !/입금|취소|반환/.test(d));

  if (withYearMonth && (looksLikeMonthFee || /기장|수수료|월$/.test(d))) {
    const year = expandYy(Number(withYearMonth[1]));
    const month = Number(withYearMonth[2]);
    if (/기타/.test(d)) return `${year}년 ${month}월 기타수수료`;
    // 원문에 기장·수수료가 있으면 기장료, 공문 스타일「26년 8월」은「2026년 8월」만
    if (/기장|수수료/.test(d)) return `${year}년 ${month}월 기장료`;
    return `${year}년 ${month}월`;
  }

  if (monthFee && looksLikeMonthFee) {
    const month = Number(monthFee[1]);
    const year =
      yearFromPrevDescription(ctx?.prevDescription) ??
      inferYearForMonth(month, ctx);
    if (/기타/.test(d)) return `${year}년 ${month}월 기타수수료`;
    if (/기장|수수료/.test(d)) return `${year}년 ${month}월 기장료`;
    return `${year}년 ${month}월`;
  }

  return raw;
}

/**
 * 공문 내역 일괄 표시 라벨.
 * 기장료(월) 사이에 끼인 조정·성실 등은 연도 없이, 조정료만 있는 줄은 원문 연도 유지.
 */
export function formatArrearsLetterLineLabels(
  lines: Array<{ description?: string | null }>,
  asOfDate?: string | null,
): string[] {
  const descs = lines.map(l => String(l.description || '').trim());
  const isMonth = descs.map(d => isMonthlyBookkeepingDesc(d));
  const isNonMonth = descs.map(d => isNonMonthlyChargeDesc(d));

  return descs.map((desc, i) => {
    let hasPrevMonth = false;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (!descs[j]) continue;
      if (isMonth[j]) {
        hasPrevMonth = true;
        break;
      }
    }
    let hasNextMonth = false;
    for (let j = i + 1; j < descs.length; j += 1) {
      if (!descs[j]) continue;
      if (isMonth[j]) {
        hasNextMonth = true;
        break;
      }
    }
    const stripYear = isNonMonth[i] && hasPrevMonth && hasNextMonth;
    return (
      formatArrearsChargeLabel(desc, {
        asOfDate,
        prevDescription: i > 0 ? descs[i - 1] : undefined,
        stripYear,
      }) || desc
    );
  });
}

type YmdParts = { year: number; month: number; day: number };

function parsePaidParts(
  raw: string | number | Date | null | undefined,
  ctx?: ArrearsLineLabelCtx,
): YmdParts | null {
  if (raw == null || raw === '') return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return {
      year: raw.getFullYear(),
      month: raw.getMonth() + 1,
      day: raw.getDate(),
    };
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 20000 && raw < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + Math.round(raw) * 86400000);
      if (!Number.isNaN(d.getTime())) {
        return {
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
          day: d.getUTCDate(),
        };
      }
    }
    return null;
  }

  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // 20260116
  const ymd = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) {
    return {
      year: Number(ymd[1]),
      month: Number(ymd[2]),
      day: Number(ymd[3]),
    };
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const dot = s.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (dot) {
    return {
      year: Number(dot[1]),
      month: Number(dot[2]),
      day: Number(dot[3]),
    };
  }

  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    return {
      year: Number(slash[1]),
      month: Number(slash[2]),
      day: Number(slash[3]),
    };
  }

  // 2026년 8월 14일 / 26년 8월14일
  const koYear = s.match(/^(20\d{2}|\d{2})\s*년\s*0?(\d{1,2})\s*월\s*0?(\d{1,2})\s*일$/);
  if (koYear) {
    let year = Number(koYear[1]);
    if (year < 100) year += 2000;
    return { year, month: Number(koYear[2]), day: Number(koYear[3]) };
  }

  // 1월 16일 / 1월16일
  const ko = s.match(/^0?(\d{1,2})\s*월\s*0?(\d{1,2})\s*일$/);
  if (ko) {
    const month = Number(ko[1]);
    const day = Number(ko[2]);
    const year = inferYearForMonth(month, ctx);
    return { year, month, day };
  }

  // 7/2
  const md = s.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    return { year: inferYearForMonth(month, ctx), month, day };
  }

  return null;
}

/** 포털 지급일 `20260116` */
export function formatArrearsPaidYmd(
  paidDate: string | number | Date | null | undefined,
  ctx?: ArrearsLineLabelCtx,
): string {
  const p = parsePaidParts(paidDate, ctx);
  if (!p) return String(paidDate ?? '').trim();
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

/** 오늘 `YYYYMMDD` */
export function todayArrearsPaidYmd(now = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 입금 중복 비교 키 — `1월 16일` ↔ `20260116` 동일 취급 (월·일만)
 */
export function paidDateMatchKey(
  paidDate: string | number | Date | null | undefined,
  ctx?: ArrearsLineLabelCtx,
): string {
  const p = parsePaidParts(paidDate, ctx);
  if (!p) return String(paidDate ?? '').replace(/\s+/g, '').trim();
  return `${p.month}|${p.day}`;
}

/** 공문 엑셀용 `M월D일` — YMD/한국어 모두 수용 */
export function formatArrearsPaidDateOffice(
  paidDate: string | number | Date | null | undefined,
  ctx?: ArrearsLineLabelCtx,
): string {
  const p = parsePaidParts(paidDate, ctx);
  if (!p) return String(paidDate ?? '').trim();
  return `${p.month}월${p.day}일`;
}
