function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function format13DigitId(d: string): string {
  if (d.length === 13) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return '';
}

/** 사업자등록번호 10자리 → 000-00-00000 */
export function formatBusinessNo(value: string): string {
  const d = digitsOnly(value);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  const trimmed = value.trim();
  if (trimmed && !trimmed.includes('-') && d.length === 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }
  return trimmed;
}

/** 법인등록번호 13자리 → 000000-0000000 */
export function formatCorporateNo(value: string): string {
  const d = digitsOnly(value);
  const formatted = format13DigitId(d);
  if (formatted) return formatted;
  return value.trim();
}

/** 주민등록번호 13자리 → 000000-0000000 */
export function formatResidentNo(value: string): string {
  const d = digitsOnly(value);
  const formatted = format13DigitId(d);
  if (formatted) return formatted;
  return value.trim();
}

/** 목록·상세 — 주민번호 우선, 없으면 법인번호 */
export function formatPersonOrCorpId(residentNo: string, corporateNo: string): string {
  const r = formatResidentNo(residentNo);
  if (r && digitsOnly(r).length === 13) return r;
  const c = formatCorporateNo(corporateNo);
  if (c && digitsOnly(c).length === 13) return c;
  return r || c;
}

export function formatIdField(key: 'businessNo' | 'corporateNo' | 'residentNo', value: string): string {
  if (key === 'businessNo') return formatBusinessNo(value);
  if (key === 'corporateNo') return formatCorporateNo(value);
  return formatResidentNo(value);
}
