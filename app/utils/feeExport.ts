import type { ClientRecord } from '@/app/types/client';
import { companyLinkKey } from '@/lib/review/companyKey';
import type { CorpFeeEntry } from '@/lib/review/corpFeeTypes';

import { bucketFeeItemsForExport, readFeeItems, resolveClientRecordFee } from './feeBreakdown';

export const FEE_EXPORT_COLUMNS = [
  '담당자',
  '업체명',
  '사업자번호',
  '기장수수료',
  '기타수수료',
  '조정료',
  '올해 매출액',
  '합계(연환산 포함)',
] as const;

export type FeeExportRow = Record<(typeof FEE_EXPORT_COLUMNS)[number], string | number>;

export function buildFeeExportRows(
  clients: readonly ClientRecord[],
  corpFeeByKey?: Record<string, CorpFeeEntry>,
  corpRevenueByClientId?: Record<string, number | null>,
): FeeExportRow[] {
  const sorted = [...clients].sort((a, b) => {
    const ma = a.manager?.trim() || '';
    const mb = b.manager?.trim() || '';
    if (ma !== mb) return ma.localeCompare(mb, 'ko');
    return a.companyName.localeCompare(b.companyName, 'ko');
  });

  return sorted.map(c => {
    const items = readFeeItems(c.intakeData);
    const buckets = bucketFeeItemsForExport(items);
    const total = resolveClientRecordFee(c);
    const key = companyLinkKey(c.companyName);
    const revenueThisYear =
      corpRevenueByClientId && c.id in corpRevenueByClientId
        ? (corpRevenueByClientId[c.id] ?? '')
        : c.businessEntityType === 'corporate' && key
          ? (corpFeeByKey?.[key]?.revenueThisYear ?? '')
          : '';

    return {
      담당자: c.manager?.trim() || '',
      업체명: c.companyName,
      사업자번호: c.businessNo ?? '',
      기장수수료: buckets.bookkeeping,
      기타수수료: buckets.etc,
      조정료: buckets.adjustment,
      '올해 매출액': revenueThisYear,
      '합계(연환산 포함)': buckets.total !== '' ? buckets.total : (total ?? ''),
    };
  });
}

export async function downloadFeeExportExcel(
  clients: readonly ClientRecord[],
  corpFeeByKey?: Record<string, CorpFeeEntry>,
  filename?: string,
  corpRevenueByClientId?: Record<string, number | null>,
): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = buildFeeExportRows(clients, corpFeeByKey, corpRevenueByClientId);
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...FEE_EXPORT_COLUMNS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '수수료');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(wb, filename ?? `수임처수수료_${date}.xlsx`);
}
