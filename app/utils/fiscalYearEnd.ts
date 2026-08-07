import type { ClientRecord } from '@/app/types/client';
import { isCorporateClient } from '@/app/utils/filingCheck';

/** intakeData.fiscalYearEndMonth (1~12). 미설정·12월은 일반 결산으로 취급 */
export function readFiscalYearEndMonth(
  intakeData: Record<string, unknown> | null | undefined,
): number | null {
  const raw = intakeData?.fiscalYearEndMonth;
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const month = Math.round(n);
  if (month < 1 || month > 12) return null;
  return month;
}

/** 12월 결산이 아닌 법인이면 「N월말」 배지 문구 */
export function fiscalYearEndBadgeLabel(client: ClientRecord): string | null {
  if (!isCorporateClient(client)) return null;
  const month = readFiscalYearEndMonth(client.intakeData);
  if (month == null || month === 12) return null;
  return `${month}월말`;
}
