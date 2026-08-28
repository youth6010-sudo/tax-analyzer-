// 국세청 사업자상태 표시 헬퍼 (상세 패널 / 대시보드 배지 공용)

export interface NtsStatusView {
  status: string;
  statusCode: string;
  taxType: string;
  closedDate: string;
  checkedAt: string | null;
  alertAckedAt?: string | null;
  alertAckedCode?: string;
}

/** 02(휴업)·03(폐업)이면 주의 대상 */
export function isNtsAlert(statusCode: string): boolean {
  return statusCode === '02' || statusCode === '03';
}

export function ntsStatusLabel(s: { statusCode: string; status: string }): string {
  switch (s.statusCode) {
    case '01':
      return '계속사업자';
    case '02':
      return '휴업';
    case '03':
      return '폐업';
    default:
      return s.status || '미등록';
  }
}

/** 배지 색상 클래스 */
export function ntsBadgeClass(statusCode: string): string {
  switch (statusCode) {
    case '01':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case '02':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case '03':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

/** YYYYMMDD → YYYY-MM-DD */
export function formatNtsDate(yyyymmdd: string): string {
  const d = String(yyyymmdd || '').replace(/\D/g, '');
  if (d.length !== 8) return yyyymmdd || '';
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** 국세청 과세유형 → 간이 / 일반 / 면세 */
export function normalizeNtsTaxType(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/간이/.test(t)) return '간이';
  if (/면세/.test(t)) return '면세';
  if (/일반|과세/.test(t)) return '일반';
  return t;
}

export function ntsTaxTypeBadgeClass(label: string): string {
  switch (label) {
    case '간이':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    case '일반':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800';
    case '면세':
      return 'border-violet-200 bg-violet-50 text-violet-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

/** 수임처 intakeData.taxKind(더존 과세유형) → 간이/일반/면세 */
export function normalizeClientTaxKind(raw: string): '' | '간이' | '일반' | '면세' {
  const k = String(raw || '').replace(/\s/g, '');
  if (!k) return '';
  if (/간이/.test(k)) return '간이';
  if (/면세/.test(k) && !/과세/.test(k)) return '면세';
  if (/일반|과세/.test(k)) return '일반';
  return '';
}

/** 수임처 과세유형 vs 국세청 과세유형 불일치 */
export function getNtsTaxTypeMismatch(
  clientTaxKind: string,
  ntsTaxType: string,
): { clientLabel: string; ntsLabel: string } | null {
  const clientNorm = normalizeClientTaxKind(clientTaxKind);
  const ntsNorm = normalizeNtsTaxType(ntsTaxType);
  if (!clientNorm || !ntsNorm || clientNorm === ntsNorm) return null;
  return { clientLabel: clientNorm, ntsLabel: ntsNorm };
}
