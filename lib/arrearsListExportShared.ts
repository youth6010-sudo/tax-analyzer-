/**
 * 총미수 목록 엑셀 — 클라이언트/서버 공용 (ExcelJS 없음)
 */
import {
  arrearsCategoryLabel,
  type ArrearsEntryDto,
  type ArrearsManagerTotal,
  type ArrearsMgmtCategory,
} from '@/app/types/arrears';

/** 엑셀에 필요한 최소 필드 (화면 행 색상 포함) */
export type ArrearsListExportItem = {
  externalCode: string;
  companyName: string;
  balance: number;
  reasonSummary?: string;
  managerName: string;
  mgmtCategory: ArrearsMgmtCategory | string;
  memo: string;
};

export type ArrearsListSheetRow = {
  코드: string;
  상호: string;
  '미수 잔액': number;
  '미수 사유': string;
  담당: string;
  관리: string;
  메모: string;
};

export function arrearsListExportFilename(asOfDate: string): string {
  const d = (asOfDate || '').trim();
  let stamp = '';
  const m = d.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (m) stamp = `${m[1].slice(2)}.${m[2]}.${m[3]}`;
  else {
    const now = new Date();
    stamp = `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  }
  return `미수목록_전체_${stamp}.xlsx`;
}

export function toArrearsListSheetRow(item: ArrearsListExportItem): ArrearsListSheetRow {
  return {
    코드: item.externalCode.startsWith('letter:') ? '' : item.externalCode,
    상호: item.companyName,
    '미수 잔액': Math.round(item.balance),
    '미수 사유': item.reasonSummary || '',
    담당: item.managerName || '',
    관리: arrearsCategoryLabel(item.mgmtCategory),
    메모: item.memo || '',
  };
}

/**
 * 화면 행 배경과 동일 (ARGB, Excel 셀 fill용)
 * letter: 미연결 → amber-50 / 분류별 Tailwind hex
 */
export function arrearsListRowFillArgb(item: ArrearsListExportItem): string | null {
  if (item.externalCode.startsWith('letter:')) return 'FFFFFBEB'; // amber-50
  switch (item.mgmtCategory) {
    case 'recovery':
      return 'FFFECACA';
    case 'bad':
      return 'FFFED7AA';
    case 'long':
      return 'FFFEF08A';
    case 'temp':
      return 'FFBBF7D0';
    case 'cms':
      return 'FFE5E7EB';
    default:
      return null;
  }
}

export function buildArrearsListManagerTotals(
  items: ArrearsListExportItem[],
): ArrearsManagerTotal[] {
  const totalMap = new Map<string, ArrearsManagerTotal>();
  for (const item of items) {
    const key = (item.managerName || '').trim() || '(미지정)';
    const cur = totalMap.get(key) ?? { managerName: key, count: 0, balance: 0 };
    cur.count += 1;
    cur.balance += item.balance;
    totalMap.set(key, cur);
  }
  return [...totalMap.values()].sort((a, b) => b.balance - a.balance);
}

/** 화면 DTO → 엑셀용 최소 필드 */
export function toArrearsListExportItem(item: ArrearsEntryDto): ArrearsListExportItem {
  return {
    externalCode: item.externalCode,
    companyName: item.companyName,
    balance: item.balance,
    reasonSummary: item.reasonSummary,
    managerName: item.managerName,
    mgmtCategory: item.mgmtCategory,
    memo: item.memo || '',
  };
}
