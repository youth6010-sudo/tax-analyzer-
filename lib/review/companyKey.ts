/**
 * 검토표 · 수임처 · 워크벤치 공통 업체 연결 키
 * NFKC → 공백 제거 → ㈜()[]/+ 제거 → lowercase
 */
export function companyLinkKey(name: string | null | undefined): string {
  if (name == null || name === '') return '';
  let base = String(name).trim().normalize('NFKC').replace(/\s+/g, '');
  base = base.replace(/주식회사|\(주\)|㈜/gi, '');
  base = base.replace(/[()（）\[\]/\\+]/g, '');
  return base.toLowerCase();
}

export function hasCompanyLinkKey(name: string | null | undefined): boolean {
  return companyLinkKey(name).length > 0;
}
