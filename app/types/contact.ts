import type { TaxTypeId } from '../config/taxTypes';

export const BUSINESS_ENTITY_TYPES = [
  { id: 'individual', label: '개인' },
  { id: 'corporate', label: '법인' },
  { id: 'nonBusiness', label: '비사업자' },
] as const;

export type BusinessEntityType = (typeof BUSINESS_ENTITY_TYPES)[number]['id'];

export const SERVICE_TYPES = [
  { id: 'bookkeeping', label: '기장' },
  { id: 'filing', label: '신고' },
  { id: 'consultation', label: '상담' },
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number]['id'];

export const BUSINESS_ENTITY_LABEL: Record<BusinessEntityType, string> = Object.fromEntries(
  BUSINESS_ENTITY_TYPES.map(t => [t.id, t.label]),
) as Record<BusinessEntityType, string>;

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = Object.fromEntries(
  SERVICE_TYPES.map(t => [t.id, t.label]),
) as Record<ServiceType, string>;

export interface ContactRecord {
  id: string;
  taxTypes: TaxTypeId[];
  businessEntityType: BusinessEntityType | '';
  serviceTypes: ServiceType[];
  manager: string;
  companyName: string;
  representative: string;
  businessNo: string;
  corporateNo: string;
  residentNo: string;
  phone: string;
  fax: string;
}

export interface ContactDatabase {
  version: number;
  updatedAt: string;
  contacts: ContactRecord[];
}

export type ContactUpdatePayload = Omit<ContactRecord, 'id'>;

export type ContactSearchField =
  | 'companyName'
  | 'representative'
  | 'businessNo'
  | 'corporateNo'
  | 'residentNo'
  | 'phone'
  | 'manager';

export const CONTACT_FIELD_LABELS: Record<ContactSearchField, string> = {
  companyName: '업체명(상호)',
  representative: '대표자',
  businessNo: '사업자번호',
  corporateNo: '법인번호',
  residentNo: '주민번호',
  phone: '전화번호',
  manager: '담당자',
};

export const EDITABLE_FIELDS: {
  key: keyof ContactUpdatePayload;
  label: string;
  mono?: boolean;
}[] = [
  { key: 'companyName', label: CONTACT_FIELD_LABELS.companyName },
  { key: 'manager', label: CONTACT_FIELD_LABELS.manager },
  { key: 'representative', label: CONTACT_FIELD_LABELS.representative },
  { key: 'businessNo', label: CONTACT_FIELD_LABELS.businessNo, mono: true },
  { key: 'corporateNo', label: CONTACT_FIELD_LABELS.corporateNo, mono: true },
  { key: 'residentNo', label: CONTACT_FIELD_LABELS.residentNo, mono: true },
  { key: 'phone', label: CONTACT_FIELD_LABELS.phone, mono: true },
  { key: 'fax', label: '팩스', mono: true },
];
