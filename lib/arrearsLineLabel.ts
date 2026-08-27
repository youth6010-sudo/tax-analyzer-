/**
 * 미수 내역 적요·지급일 — 포털 표시용 통일 포맷
 * (공문 엑셀/인쇄는 별도 변환기로 사무실 형식 유지)
 */

export type ArrearsLineLabelCtx = {
  /** letterDate 또는 asOfDate (YYYY-MM-DD / YYYY.MM.DD) */
  asOfDate?: string | null;
  prevDescription?: string | null;
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

/**
 * 청구 적요 → `2026년 7월 기장료` / `2025년 조정료` 등
 * 알 수 없으면 원문 trim 반환
 */
export function formatArrearsChargeLabel(
  description: string,
  ctx?: ArrearsLineLabelCtx,
): string {
  const raw = String(description || '').trim();
  if (!raw) return '';
  const d = compactDesc(raw);

  if (/^전기이월/.test(d) || d === '원장반영') {
    const y =
      yearFromPrevDescription(ctx?.prevDescription) ??
      parseAsOfParts(ctx?.asOfDate)?.year;
    return y ? `${y}년 전기이월` : '전기이월';
  }

  if (/성실/.test(d)) {
    const ym = d.match(/(20\d{2}|\d{2})년/);
    const y = ym
      ? expandYy(Number(ym[1]))
      : (parseAsOfParts(ctx?.asOfDate)?.year ?? new Date().getFullYear());
    return `${y}년 성실신고`;
  }

  if (/개인조정/.test(d)) {
    const ym = d.match(/(20\d{2}|\d{2})년/);
    const y = ym
      ? expandYy(Number(ym[1]))
      : (parseAsOfParts(ctx?.asOfDate)?.year ?? new Date().getFullYear());
    return `${y}년 조정료(개인)`;
  }

  if (/세무조정|법인조정|조정료|조정수수료/.test(d) || (/조정/.test(d) && !/월/.test(d))) {
    const ym = d.match(/(20\d{2}|\d{2})년/);
    const y = ym
      ? expandYy(Number(ym[1]))
      : (parseAsOfParts(ctx?.asOfDate)?.year ?? new Date().getFullYear());
    return `${y}년 조정료`;
  }

  if (/부가세/.test(d)) {
    const withYearMonth = d.match(/(20\d{2}|\d{2})년.*?(\d{1,2})월/);
    const monthOnly = d.match(/(\d{1,2})월/);
    let year: number | null = null;
    let month: number | null = null;
    if (withYearMonth) {
      year = expandYy(Number(withYearMonth[1]));
      month = Number(withYearMonth[2]);
    } else if (monthOnly) {
      month = Number(monthOnly[1]);
      year =
        yearFromPrevDescription(ctx?.prevDescription) ??
        inferYearForMonth(month, ctx);
    } else {
      year = parseAsOfParts(ctx?.asOfDate)?.year ?? null;
    }
    const shop = d
      .replace(/^.*부가세(?:신고)?[-:]?/i, '')
      .replace(/신고/g, '')
      .replace(/(20\d{2}|\d{2})년/g, '')
      .replace(/\d{1,2}월/g, '');
    const base =
      year && month
        ? `${year}년 ${month}월 부가세`
        : year
          ? `${year}년 부가세`
          : '부가세';
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
    return `${year}년 ${month}월 기장료`;
  }

  if (monthFee && looksLikeMonthFee) {
    const month = Number(monthFee[1]);
    const year =
      yearFromPrevDescription(ctx?.prevDescription) ??
      inferYearForMonth(month, ctx);
    if (/기타/.test(d)) return `${year}년 ${month}월 기타수수료`;
    return `${year}년 ${month}월 기장료`;
  }

  return raw;
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
 * 입금 중복 비교 키 — `1월 16일` ↔ `20260116` 동일 취급
 * (연도 없는 한국어는 월·일만: `1|16`)
 */
export function paidDateMatchKey(
  paidDate: string | number | Date | null | undefined,
  ctx?: ArrearsLineLabelCtx,
): string {
  const p = parsePaidParts(paidDate, ctx);
  if (!p) return String(paidDate ?? '').replace(/\s+/g, '').trim();
  // 연도 있는 원문이면 풀 키, 한국어만이면 월일 (양쪽 asOf 달라도 매칭)
  const raw = String(paidDate ?? '').trim();
  if (/^\d{8}$/.test(raw) || /^\d{4}[-./]/.test(raw)) {
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }
  if (/월/.test(raw) || /^(\d{1,2})[./](\d{1,2})$/.test(raw)) {
    // 한국어·월일만 — 연도 추론 포함해 ISO로 (asOf 동일 시 PDF YMD와 맞춤)
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
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
