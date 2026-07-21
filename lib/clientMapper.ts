import type { ClientRecord } from '@/app/types/client';
import type { ContactRecord } from '@/app/types/contact';
import type { Client } from '@/db/schema';
import { mobilePhoneFrom } from '@/app/utils/clientPhone';

const LIST_INTAKE_KEYS = [
  'category',
  'douzoneCode',
  'mobilePhone',
  'address',
  'statusLabel',
  'closedDate',
  'bookkeepingFee',
  'adjustmentFee',
  'feeItems',
  'taxKind',
  /** 간이지급·연말정산 그리드 활성화 */
  'incomeTypes',
  'yearEndTypes',
  'taxFlags',
  'withholdingSettings',
  'filingType',
  /** 레거시 더존 Y/N */
  'employed',
  'daily',
  'payrollHistory',
  /** 수임처 목록 엑셀 — 필요자료·특이사항 */
  'notes',
  'noticeData',
  /** 부가세 자료입력 진행도 */
  'vatMaterialFlags',
  'vatEntryProgress',
  'vatAnnualProgress',
  /** 부가세 검토표 신고분 수수료 */
  'vatFilingFees',
] as const;

/** 목록 API·bootstrap용 — 큰 intake JSON 제외 (소득유형·taxFlags는 신고 그리드용으로 유지) */
export function slimIntakeDataForList(intakeData: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!intakeData) return {};
  const out: Record<string, unknown> = {};
  for (const k of LIST_INTAKE_KEYS) {
    const v = intakeData[k];
    if (v == null) continue;
    if (typeof v === 'object') {
      out[k] = v;
    } else if (v !== '') {
      out[k] = v;
    }
  }
  return out;
}

export function clientToRecord(row: Client, opts?: { primaryContactMobile?: string }): ClientRecord {
  const intakeData = row.intakeData ?? {};
  const fromIntake = mobilePhoneFrom(intakeData);
  return {
    id: row.id,
    companyName: row.companyName,
    manager: row.manager,
    representative: row.representative,
    businessNo: row.businessNo,
    corporateNo: row.corporateNo,
    residentNo: row.residentNo,
    phone: row.phone,
    mobilePhone: fromIntake || opts?.primaryContactMobile || '',
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
    nts: row.ntsCheckedAt
      ? {
          status: row.ntsStatus ?? '',
          statusCode: row.ntsStatusCode ?? '',
          taxType: row.ntsTaxType ?? '',
          closedDate: row.ntsClosedDate ?? '',
          checkedAt: row.ntsCheckedAt.toISOString(),
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 목록 조회 전용 — intakeData 최소 필드만 */
export function clientToListRecord(row: Client): ClientRecord {
  return clientToRecord({ ...row, intakeData: slimIntakeDataForList(row.intakeData) });
}

/** PATCH 응답 등 — ClientRecord를 목록 API와 동일 형식으로 */
export function clientRecordToListRecord(record: ClientRecord): ClientRecord {
  return { ...record, intakeData: slimIntakeDataForList(record.intakeData) };
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
