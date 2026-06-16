/** intake_data.mobilePhone 읽기/쓰기 */
export function mobilePhoneFrom(intakeData: Record<string, unknown> | undefined): string {
  const v = intakeData?.mobilePhone;
  return typeof v === 'string' ? v : '';
}

export function isMobileNumber(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  return /^01[016789]/.test(d);
}

export function splitContactPhone(raw: string): { phone: string; mobilePhone: string } {
  const t = raw.trim();
  if (!t) return { phone: '', mobilePhone: '' };
  if (isMobileNumber(t)) return { phone: '', mobilePhone: t };
  return { phone: t, mobilePhone: '' };
}

/** 주번호 옆 연락처 이름 표시 */
export function formatPhoneWithContactName(phone: string, contactName?: string): string {
  const p = phone.trim();
  const name = contactName?.trim();
  if (!p) return name ? `(${name})` : '';
  return name ? `${p} (${name})` : p;
}
