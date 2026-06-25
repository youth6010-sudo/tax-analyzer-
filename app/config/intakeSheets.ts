import { CHECKLIST_KEYS } from '@/app/types/intake';
import { CHECKLIST_LABEL, CHECKLIST_LABEL_FULL } from '@/app/components/intake/intakeUtils';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

export type InquiryColumnKey =
  | 'inquiryDate'
  | 'companyName'
  | 'phone'
  | 'channel'
  | 'consultant'
  | 'inquiryContent'
  | 'note'
  | 'proposedFee'
  | 'industry'
  | 'businessNo'
  | 'representative'
  | 'repPhone'
  | 'admin'
  | 'adminPhone'
  | 'address'
  | 'email'
  | 'contractStatus';

export type ProcessColumnKey =
  | 'companyName'
  | 'feeStartDate'
  | 'monthlyFee'
  | 'channel'
  | (typeof CHECKLIST_KEYS)[number];

export type SheetColumn = {
  key: string;
  label: string;
  width?: string;
  sticky?: boolean;
  editable?: boolean;
  multiline?: boolean;
  type?: 'text' | 'number' | 'check';
};

export const INQUIRY_LIST_COLUMNS: SheetColumn[] = [
  { key: 'inquiryDate', label: '문의일자', width: '5.5rem' },
  { key: 'companyName', label: '업체명' },
  { key: 'phone', label: '전화번호', width: '7rem' },
  { key: 'channel', label: '유입채널' },
  { key: 'consultant', label: '초회상담자' },
  { key: 'blueholeCase', label: '블루홀케이스', width: '5.5rem' },
  { key: 'contractStatus', label: '계약유무' },
  { key: 'proposedFee', label: '제안금액', type: 'number' },
];

export const INQUIRY_COLUMNS: SheetColumn[] = [
  { key: 'inquiryDate', label: '문의일자', width: '6.5rem', editable: true },
  { key: 'companyName', label: '업체명', width: '9rem', sticky: true, editable: true },
  { key: 'phone', label: '전화번호', width: '7rem', editable: true },
  { key: 'channel', label: '유입채널', width: '6.5rem', editable: true },
  { key: 'consultant', label: '초회상담자', width: '5.5rem', editable: true },
  { key: 'inquiryContent', label: '문의내용', width: '14rem', editable: true, multiline: true },
  { key: 'blueholeCase', label: '블루홀케이스', width: '6rem', editable: true },
  { key: 'note', label: '특이사항', width: '10rem', editable: true, multiline: true },
  { key: 'proposedFee', label: '제안금액', width: '5.5rem', editable: true, type: 'number' },
  { key: 'industry', label: '업종', width: '7rem', editable: true },
  { key: 'businessNo', label: '사업자번호', width: '7rem', editable: true },
  { key: 'representative', label: '대표자', width: '5rem', editable: true },
  { key: 'repPhone', label: '대표 연락처', width: '7rem', editable: true },
  { key: 'admin', label: '관리자', width: '5rem', editable: true },
  { key: 'adminPhone', label: '관리자 연락처', width: '7rem', editable: true },
  { key: 'address', label: '주소', width: '12rem', editable: true, multiline: true },
  { key: 'email', label: '이메일', width: '8rem', editable: true },
  { key: 'contractStatus', label: '계약유무', width: '5.5rem', editable: true },
];

export const PROCESS_META_COLUMNS: SheetColumn[] = [
  { key: 'companyName', label: '업체명', width: '7rem', sticky: true },
  { key: 'feeStartDate', label: '수수료 발생일', width: '6rem', editable: true },
  { key: 'monthlyFee', label: CLIENT_FIELD_LABELS.fee, width: '4.5rem', editable: true, type: 'number' },
  { key: 'channel', label: '유입 경로', width: '5.5rem', editable: true },
];

export const PROCESS_CHECKLIST_COLUMNS: SheetColumn[] = CHECKLIST_KEYS.map(key => ({
  key,
  label: CHECKLIST_LABEL[key] ?? key,
  width: '6.5rem',
  type: 'check' as const,
}));

export const PROCESS_COLUMNS: SheetColumn[] = [
  ...PROCESS_META_COLUMNS,
  ...PROCESS_CHECKLIST_COLUMNS,
];

export const PROCESS_CHECKLIST_TITLES: Record<string, string> = CHECKLIST_LABEL_FULL;
