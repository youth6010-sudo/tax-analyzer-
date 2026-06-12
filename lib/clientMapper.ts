import type { ClientRecord } from '@/app/types/client';
import type { ContactRecord } from '@/app/types/contact';
import type { Client } from '@/db/schema';
import { mobilePhoneFrom } from '@/app/utils/clientPhone';

export function clientToRecord(row: Client): ClientRecord {
  const intakeData = row.intakeData ?? {};
  return {
    id: row.id,
    companyName: row.companyName,
    manager: row.manager,
    representative: row.representative,
    businessNo: row.businessNo,
    corporateNo: row.corporateNo,
    residentNo: row.residentNo,
    phone: row.phone,
    mobilePhone: mobilePhoneFrom(intakeData),
    fax: row.fax,
    taxTypes: (row.taxTypes ?? []) as ClientRecord['taxTypes'],
    businessEntityType: (row.businessEntityType ?? '') as ClientRecord['businessEntityType'],
    serviceTypes: (row.serviceTypes ?? []) as ClientRecord['serviceTypes'],
    feeSummary: row.feeSummary ?? null,
    program: row.program ?? '',
    converted: row.converted ?? false,
    colbert: row.colbert ?? false,
    status: row.status,
    assignedUserId: row.assignedUserId,
    intakeStep: row.intakeStep,
    intakeData: intakeData,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function clientRecordToContact(record: ClientRecord): ContactRecord {
  return {
    id: record.id,
    companyName: record.companyName,
    manager: record.manager,
    representative: record.representative,
    businessNo: record.businessNo,
    corporateNo: record.corporateNo,
    residentNo: record.residentNo,
    phone: record.phone,
    mobilePhone: record.mobilePhone,
    fax: record.fax,
    taxTypes: record.taxTypes,
    businessEntityType: record.businessEntityType,
    serviceTypes: record.serviceTypes,
  };
}

export function clientToContact(row: Client): ContactRecord {
  return clientRecordToContact(clientToRecord(row));
}
