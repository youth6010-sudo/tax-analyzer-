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
