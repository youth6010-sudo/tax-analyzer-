/** 유입 문의일 — 엑셀·수동입력 혼재 형식을 정렬·표시용으로 통일 */

export function parseIntakeDateMs(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === '-') return null;

  if (/^\d{5}$/.test(t)) {
    const serial = Number(t);
    if (serial > 30000 && serial < 60000) {
      return Date.UTC(1970, 0, 1) + Math.round((serial - 25569) * 86400 * 1000);
    }
  }

  const normalized = t.replace(/[./]/g, '-').replace(/\s+/g, '');

  let m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);

  m = normalized.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = +m[1] + (+m[1] < 50 ? 2000 : 1900);
    return Date.UTC(y, +m[2] - 1, +m[3]);
  }

  const digits = t.replace(/\D/g, '');
  if (digits.length === 8) {
    return Date.UTC(
      +digits.slice(0, 4),
      +digits.slice(4, 6) - 1,
      +digits.slice(6, 8),
    );
  }

  const parsed = Date.parse(t);
  return Number.isNaN(parsed) ? null : parsed;
}

/** 표시·입력 통일: YYYY-MM-DD */
export function formatIntakeDate(raw: string): string {
  const ms = parseIntakeDateMs(raw);
  if (ms == null) return raw.trim();
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function compareIntakeDateDesc(a: string, b: string): number {
  const ta = parseIntakeDateMs(a);
  const tb = parseIntakeDateMs(b);
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return tb - ta;
}
