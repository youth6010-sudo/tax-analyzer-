export type ChurnColumnKey =
  | 'companyName'
  | 'churnedAt'
  | 'feeAmount'
  | 'dataCleanup'
  | 'churnType'
  | 'earlySign'
  | 'reason'
  | 'manager';

export type ChurnSheetColumn = {
  key: ChurnColumnKey;
  label: string;
  width: string;
  sticky?: boolean;
  readOnly?: boolean;
  type?: 'text' | 'number' | 'date';
};

/** 엑셀 유출 시트 컬럼 순서 */
export const CHURN_COLUMNS: ChurnSheetColumn[] = [
  { key: 'companyName', label: '업체명', width: '9rem', sticky: true, readOnly: true },
  { key: 'churnedAt', label: '계약 종료일', width: '7rem', type: 'date' },
  { key: 'feeAmount', label: '기장료', width: '5.5rem', type: 'number' },
  { key: 'dataCleanup', label: '자료 정리', width: '6rem' },
  { key: 'churnType', label: '유형', width: '6rem' },
  { key: 'earlySign', label: '전조증상', width: '7rem' },
  { key: 'reason', label: '유출 사유', width: '8rem' },
  { key: 'manager', label: '담당', width: '5rem' },
];

export const CHURN_EDITABLE_COLUMNS = CHURN_COLUMNS.filter(c => !c.readOnly && c.key !== 'companyName');

export function churnDateInputValue(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export function formatChurnDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function formatChurnFee(amount: number | null): string {
  if (amount == null) return '-';
  return amount.toLocaleString();
}
