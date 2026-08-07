import { sql } from 'drizzle-orm';
import type { ClientRecord } from '@/app/types/client';
import type { ContactRecord } from '@/app/types/contact';
import { clients, type Client } from '@/db/schema';
import { mobilePhoneFrom } from '@/app/utils/clientPhone';

/** 목록·bootstrap·검색 인덱스에 실을 intake 키 (부가세 진행도·안내문은 전용 API) */
export const LIST_INTAKE_KEYS = [
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
  /** 부가세 자료 플래그·신고분 수수료 (진행도 맵은 제외) */
  'vatMaterialFlags',
  'vatFilingFees',
  /** 법인 결산월 (수임처 목록 6월말 등 배지) */
  'fiscalYearEndMonth',
] as const;

/** 부가세 검토표(진행도·연간) API 전용 — 목록 slim에 넣지 않음 */
export const VAT_PROGRESS_INTAKE_KEYS = [
  ...LIST_INTAKE_KEYS,
  'vatEntryProgress',
  'vatAnnualProgress',
] as const;

/** 목록 API·bootstrap용 — 큰 intake JSON 제외 (소득유형·taxFlags는 신고 그리드용으로 유지) */
export function slimIntakeDataForList(
  intakeData: Record<string, unknown> | undefined,
  keys: readonly string[] = LIST_INTAKE_KEYS,
): Record<string, unknown> {
  if (!intakeData) return {};
  const out: Record<string, unknown> = {};
  for (const k of keys) {
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

/** DB 목록 조회용 — 허용 키만 jsonb_build_object 로 프로젝션 */
export function listIntakeDataSql(
  column = clients.intakeData,
  keys: readonly string[] = LIST_INTAKE_KEYS,
) {
  const args = keys.flatMap(key => [
    sql.raw(`'${key}'`),
    sql`${column} -> ${sql.raw(`'${key}'`)}`,
  ]);
  return sql<Record<string, unknown>>`
    COALESCE(
      jsonb_strip_nulls(jsonb_build_object(${sql.join(args, sql`, `)})),
      '{}'::jsonb
    )
  `;
}

function buildListClientSelect(intakeData: ReturnType<typeof listIntakeDataSql>) {
  return {
    id: clients.id,
    companyName: clients.companyName,
    manager: clients.manager,
    representative: clients.representative,
    businessNo: clients.businessNo,
    corporateNo: clients.corporateNo,
    residentNo: clients.residentNo,
    phone: clients.phone,
    fax: clients.fax,
    taxTypes: clients.taxTypes,
    businessEntityType: clients.businessEntityType,
    serviceTypes: clients.serviceTypes,
    feeSummary: clients.feeSummary,
    program: clients.program,
    converted: clients.converted,
    colbert: clients.colbert,
    status: clients.status,
    assignedUserId: clients.assignedUserId,
    intakeStep: clients.intakeStep,
    intakeData,
    source: clients.source,
    blueholeClientId: clients.blueholeClientId,
    ntsStatus: clients.ntsStatus,
    ntsStatusCode: clients.ntsStatusCode,
    ntsTaxType: clients.ntsTaxType,
    ntsClosedDate: clients.ntsClosedDate,
    ntsCheckedAt: clients.ntsCheckedAt,
    ntsAlertAckedAt: clients.ntsAlertAckedAt,
    ntsAlertAckedCode: clients.ntsAlertAckedCode,
    createdAt: clients.createdAt,
    updatedAt: clients.updatedAt,
  };
}

/** listClients / getClientsByIds 공통 SELECT (intake 슬림) */
export const listClientSelect = buildListClientSelect(listIntakeDataSql());

/** 부가세 진행도·연간표 — vatEntryProgress / vatAnnualProgress 포함 */
export const listClientSelectVat = buildListClientSelect(
  listIntakeDataSql(clients.intakeData, VAT_PROGRESS_INTAKE_KEYS),
);

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
          alertAckedAt: row.ntsAlertAckedAt ? row.ntsAlertAckedAt.toISOString() : null,
          alertAckedCode: row.ntsAlertAckedCode ?? '',
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 목록 조회 전용 — intakeData 최소 필드만 (SQL 프로젝션 후에도 화이트리스트 재적용) */
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
