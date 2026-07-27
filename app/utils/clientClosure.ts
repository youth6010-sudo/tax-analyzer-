import type { ChurnSummary, ClientRecord } from '@/app/types/client';
import type { FilingTaxId, FilingPeriod, VatPhase } from '@/app/utils/filingCheck';

export type ClientWithChurn = ClientRecord & { churn?: ChurnSummary | null };

function parseYyyymmdd(raw: string): Date | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const dt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const ymd = parseYyyymmdd(s);
  if (ymd) return ymd;
  const dt = new Date(s.includes('T') ? s : `${s}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** 폐업·해임 확인 대상 여부 */
export function isClosureReviewClient(
  client: ClientRecord,
  ntsStatusCodeOverride?: string,
): boolean {
  if (client.status === 'churned') return true;
  const code = ntsStatusCodeOverride ?? client.nts?.statusCode ?? '';
  if (code === '02' || code === '03') return true;
  if (client.intakeData?.closedDate) return true;
  if (String(client.intakeData?.statusLabel ?? '').trim() === '폐업') return true;
  return false;
}

/** 해임일·폐업일 기준 날짜 (없으면 null) */
export function parseClientClosureDate(client: ClientWithChurn): Date | null {
  if (client.churn?.churnedAt) {
    const d = new Date(client.churn.churnedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (client.nts?.closedDate) {
    const d = parseYyyymmdd(client.nts.closedDate);
    if (d) return d;
  }
  const intakeClosed = client.intakeData?.closedDate;
  if (intakeClosed != null && String(intakeClosed).trim()) {
    const d = parseFlexibleDate(String(intakeClosed));
    if (d) return d;
  }
  if (client.status === 'churned' && client.updatedAt) {
    const d = new Date(client.updatedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function getClientClosureYear(client: ClientWithChurn): number | null {
  return parseClientClosureDate(client)?.getFullYear() ?? null;
}

export function formatClosureYearLabel(year: number): string {
  return `${String(year).slice(-2)}년`;
}

export function formatClientClosureDate(client: ClientWithChurn): string {
  const d = parseClientClosureDate(client);
  if (!d) return '';
  return d.toLocaleDateString('ko-KR');
}

export type ClosureKind = '해임' | '폐업' | '휴업';

export function getClientClosureKind(
  client: ClientRecord,
  ntsStatusCodeOverride?: string,
): ClosureKind {
  if (client.status === 'churned') return '해임';
  const code = ntsStatusCodeOverride ?? client.nts?.statusCode ?? '';
  if (code === '03') return '폐업';
  if (code === '02') return '휴업';
  if (String(client.intakeData?.statusLabel ?? '').trim() === '폐업') return '폐업';
  if (client.intakeData?.closedDate) return '폐업';
  return '해임';
}

/**
 * 신고 기간의 시작 연월(첫날 00:00) — 유출일 비교 기준.
 * 원천세/간이지급: 해당 월 1일
 * 부가세: 1기 예정 = 1월, 1기 확정 = 1월, 2기 예정 = 7월, 2기 확정 = 7월
 * 법인·종소세·기타: 해당 연도 1월 1일
 */
export function filingPeriodStartDate(taxId: FilingTaxId, period: FilingPeriod): Date {
  const { year, month, vatPhase } = period;
  if (taxId === 'withholding' || taxId === 'simplePayroll') {
    return new Date(year, month - 1, 1);
  }
  if (taxId === 'vat') {
    const startMonth: Record<VatPhase, number> = {
      '1기 예정': 1,
      '1기 확정': 1,
      '2기 예정': 7,
      '2기 확정': 7,
    };
    return new Date(year, (startMonth[vatPhase] ?? 1) - 1, 1);
  }
  // corporate, income, comprehensive 등 연 단위
  return new Date(year, 0, 1);
}

/**
 * 유출·폐업일이 신고 기간 시작일 이전이면 true (목록 제외 대상).
 * 유출일이 불명확하면 false (이번 신고분에는 유지).
 */
export function isClosedBeforeFilingPeriod(
  client: ClientRecord,
  taxId: FilingTaxId,
  period: FilingPeriod,
): boolean {
  if (!isClosureReviewClient(client)) return false;
  const closedAt = parseClientClosureDate(client as ClientWithChurn);
  if (!closedAt) return false; // 날짜 불명 → 이번 신고에 포함(안내 표시)
  const periodStart = filingPeriodStartDate(taxId, period);
  return closedAt < periodStart;
}

/**
 * 신고대상확인 목록용 안내 — 유출(해임)·폐업·휴업 사업장이 이번 신고 기간 중 발생했을 때 표시.
 * 기간 이전 유출은 목록 자체에서 제외되므로 null.
 */
export function filingClosureNotice(
  client: ClientRecord,
  ntsStatusCodeOverride?: string,
): string | null {
  if (!isClosureReviewClient(client, ntsStatusCodeOverride)) return null;
  if (client.status === 'churned') return '유출된 사업장입니다';
  const kind = getClientClosureKind(client, ntsStatusCodeOverride);
  if (kind === '폐업') return '폐업된 사업장입니다';
  if (kind === '휴업') return '휴업 중인 사업장입니다';
  return '유출된 사업장입니다';
}

export const CLOSURE_YEAR_UNKNOWN = 'unknown' as const;
export type ClosureYearKey = number | typeof CLOSURE_YEAR_UNKNOWN;

/** 연도 내림차순, 연도 미상은 맨 아래 */
export function groupClientsByClosureYear(
  clients: ClientWithChurn[],
): { year: ClosureYearKey; label: string; clients: ClientWithChurn[] }[] {
  const map = new Map<ClosureYearKey, ClientWithChurn[]>();
  for (const c of clients) {
    const y = getClientClosureYear(c);
    const key: ClosureYearKey = y ?? CLOSURE_YEAR_UNKNOWN;
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  const years = [...map.keys()].filter((k): k is number => k !== CLOSURE_YEAR_UNKNOWN).sort((a, b) => b - a);
  const groups: { year: ClosureYearKey; label: string; clients: ClientWithChurn[] }[] = years.map(y => ({
    year: y,
    label: formatClosureYearLabel(y),
    clients: map.get(y) ?? [],
  }));
  const unknown = map.get(CLOSURE_YEAR_UNKNOWN);
  if (unknown?.length) {
    groups.push({ year: CLOSURE_YEAR_UNKNOWN, label: '연도 미상', clients: unknown });
  }
  return groups;
}
