/** 연락처 역할 옵션 */
export const CONTACT_ROLES = [
  '대표',
  '사모',
  '담당_노무사',
  '직원',
  '실무',
  '이사',
  '과장',
  '실장',
  '사장',
  '기타',
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export interface ClientContactRecord {
  id: string;
  clientId: string;
  name: string;
  role: string;
  phone: string;
  mobilePhone: string;
  contactKind: string;
  isPrimary: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export type ClientContactPayload = {
  name?: string;
  role?: string;
  phone?: string;
  mobilePhone?: string;
  contactKind?: string;
  isPrimary?: boolean;
};
