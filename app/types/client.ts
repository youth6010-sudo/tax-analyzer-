import type { ContactRecord } from './contact';

export type ClientStatus = 'intake' | 'active' | 'churned';
export type ClientSource = 'tp_import' | 'manual_intake' | 'youth_excel' | 'douzone_export';

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
}

export interface ChurnRecordUpdatePayload {
  reason?: string;
  detail?: string;
  churnedAt?: string;
  feeAmount?: number | null;
  dataCleanup?: string;
  churnType?: string;
  earlySign?: string;
}

export const CHURN_REASONS = [
  '타 세무사 이전',
  '폐업·휴업',
  '직접 기장',
  '비용·서비스 불만',
  '연락 두절',
  '기타',
] as const;
