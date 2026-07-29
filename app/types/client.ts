import type { ContactRecord } from './contact';

export type ClientStatus = 'intake' | 'active' | 'churned';
export type ClientSource = 'tp_import' | 'manual_intake' | 'youth_excel' | 'douzone_export';

export interface ClientFeeChange {
  id: string;
  previousFee: number | null;
  newFee: number | null;
  changedByName: string;
  changedAt: string;
}

export interface ClientRecord extends ContactRecord {
  status: ClientStatus;
  assignedUserId: string | null;
  intakeStep: number;
  intakeData: Record<string, unknown>;
  source: ClientSource;
  feeSummary: number | null;
  program: string;
  converted: boolean;
  colbert: boolean;
  createdAt: string;
  updatedAt: string;
  /** 주 연락처(is_primary) 이름 */
  primaryContactName?: string;
  /** 국세청 사업자상태 캐시 */
  nts?: NtsStatusCache | null;
}

export interface NtsStatusCache {
  status: string;
  statusCode: string;
  taxType: string;
  closedDate: string;
  checkedAt: string | null;
  /** 휴업 알림 확인 시각 */
  alertAckedAt?: string | null;
  /** 확인 당시 코드(현재 statusCode와 같을 때만 유효) */
  alertAckedCode?: string;
}

export interface ChurnRecordView {
  id: string;
  clientId: string | null;
  companyName: string;
  manager: string;
  reason: string;
  detail: string;
  churnType: string;
  dataCleanup: string;
  earlySign: string;
  feeAmount: number | null;
  churnedAt: string;
  recordedByName: string | null;
}

/** 검색 결과에 붙는 유출 요약 */
export interface ChurnSummary {
  id: string;
  churnedAt: string;
  reason: string;
  detail: string;
  churnType: string;
  dataCleanup: string;
  earlySign: string;
  feeAmount: number | null;
}

export interface ClientSearchResult extends ClientRecord {
  churn?: ChurnSummary | null;
  /** 검색어가 연락처 이름/번호와 매칭된 경우 */
  matchedContactName?: string;
  /** bootstrap 검색 인덱스 전용 */
  contactSearchText?: string;
  contactNames?: string[];
  intakeSearchText?: string;
}

export interface ChurnRegisterPayload {
  clientId: string;
  reason: string;
  detail?: string;
  churnedAt?: string;
  feeAmount?: number | null;
  dataCleanup?: string;
  churnType?: string;
  earlySign?: string;
  manager?: string;
}

export interface ChurnRecordUpdatePayload {
  reason?: string;
  detail?: string;
  churnedAt?: string;
  feeAmount?: number | null;
  dataCleanup?: string;
  churnType?: string;
  earlySign?: string;
  manager?: string;
}

export const CHURN_REASONS = [
  '타 세무사 이전',
  '폐업·휴업',
  '직접 기장',
  '비용·서비스 불만',
  '연락 두절',
  '기타',
] as const;
