import type { ClientRecord } from '@/app/types/client';

export type DuplicateGroupReason = 'same_business_no' | 'same_name' | 'similar_name';

export interface ClientRelatedCounts {
  inquiries: number;
  processes: number;
  churns: number;
  meetings: number;
  reports: number;
  settlements: number;
}

export interface DuplicateClientItem extends ClientRecord {
  relatedCounts: ClientRelatedCounts;
}

export interface DuplicateGroup {
  id: string;
  reason: DuplicateGroupReason;
  label: string;
  clients: DuplicateClientItem[];
}

export const REASON_LABEL: Record<DuplicateGroupReason, string> = {
  same_business_no: '사업자번호 동일',
  same_name: '상호 동일',
  similar_name: '상호 유사',
};

export const REASON_PRIORITY: Record<DuplicateGroupReason, number> = {
  same_business_no: 3,
  same_name: 2,
  similar_name: 1,
};
