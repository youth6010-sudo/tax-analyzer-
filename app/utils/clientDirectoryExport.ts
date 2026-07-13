import type { ClientRecord } from '@/app/types/client';
import { getClientCategory, getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import { formatBusinessNo } from '@/app/utils/idFormat';
import { normalizeNtsTaxType, ntsStatusLabel } from '@/app/utils/ntsStatus';
import {
  isClientCorporateForMaterials,
  readMaterialsBundle,
} from '@/lib/clientMaterials';

export const DIRECTORY_EXPORT_COLUMNS = [
  '상호',
  '사업자번호',
  '법인등록번호',
  '대표자',
  '담당자',
  '대분류',
  '세무사랑코드',
  '전화',
  '휴대폰',
  '주소',
  '등록일',
  '수임상태',
  '국세청과세유형',
  '국세청사업자상태',
  '원천세_필요자료',
  '원천세_특이사항',
  '부가세_필요자료',
  '부가세_특이사항',
  '종소세_필요자료',
  '종소세_특이사항',
  '법인세_필요자료',
  '법인세_특이사항',
  '기타_특이사항',
] as const;

export type DirectoryExportRow = Record<(typeof DIRECTORY_EXPORT_COLUMNS)[number], string>;

function clientStatusLabel(status: ClientRecord['status']): string {
  if (status === 'churned') return '해임';
  if (status === 'intake') return '유입';
  return '정상';
}

function formatExportDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ko-KR');
  } catch {
    return iso;
  }
}

export function clientNtsTaxTypeLabel(client: ClientRecord): string {
  const fromNts = normalizeNtsTaxType(client.nts?.taxType ?? '');
  if (fromNts) return fromNts;
  const raw = typeof client.intakeData?.taxKind === 'string' ? client.intakeData.taxKind : '';
  return normalizeNtsTaxType(raw) || '';
}

export function buildDirectoryExportRows(clients: readonly ClientRecord[]): DirectoryExportRow[] {
  const sorted = [...clients].sort((a, b) => {
    const ma = a.manager?.trim() || '';
    const mb = b.manager?.trim() || '';
    if (ma !== mb) return ma.localeCompare(mb, 'ko');
    return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
  });

  return sorted.map(c => {
    const address =
      typeof c.intakeData?.address === 'string' ? c.intakeData.address.trim() : '';
    const mobileFromIntake =
      typeof c.intakeData?.mobilePhone === 'string' ? c.intakeData.mobilePhone.trim() : '';
    const bundle = readMaterialsBundle(c);
    const isCorporate = isClientCorporateForMaterials(c);

    return {
      상호: c.companyName || '',
      사업자번호: c.businessNo ? formatBusinessNo(c.businessNo) : '',
      법인등록번호: c.corporateNo || '',
      대표자: c.representative || '',
      담당자: c.manager?.trim() || '미지정',
      대분류: getClientCategory(c),
      세무사랑코드: getClientDouzoneCode(c) || '',
      전화: c.phone || '',
      휴대폰: c.mobilePhone || mobileFromIntake || '',
      주소: address,
      등록일: formatExportDate(c.createdAt),
      수임상태: clientStatusLabel(c.status),
      국세청과세유형: clientNtsTaxTypeLabel(c) || '',
      국세청사업자상태: c.nts
        ? ntsStatusLabel({ statusCode: c.nts.statusCode, status: c.nts.status })
        : '',
      // 수임처 상세「필요자료 · 특이사항」과 동일 소스
      원천세_필요자료: bundle.withholdingMaterials,
      원천세_특이사항: bundle.withholdingNotes,
      부가세_필요자료: bundle.vatMaterials,
      부가세_특이사항: bundle.vatNotes,
      종소세_필요자료: isCorporate ? '' : bundle.incomeMaterials,
      종소세_특이사항: isCorporate ? '' : bundle.incomeNotes,
      법인세_필요자료: isCorporate ? bundle.corporateMaterials : '',
      법인세_특이사항: isCorporate ? bundle.corporateNotes : '',
      기타_특이사항: bundle.otherMaterials,
    };
  });
}

export async function downloadDirectoryExportExcel(
  clients: readonly ClientRecord[],
  filename?: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = buildDirectoryExportRows(clients);
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...DIRECTORY_EXPORT_COLUMNS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '수임처목록');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(wb, filename ?? `수임처목록_${date}.xlsx`);
}
