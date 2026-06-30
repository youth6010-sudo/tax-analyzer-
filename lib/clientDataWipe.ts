import { count, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  churnRecords,
  clientContacts,
  clientFeeChanges,
  clientFeeImportPending,
  clientMeetings,
  clients,
  intakeInquiries,
  intakeProcesses,
  reportDeliveries,
  settlementVisits,
  taxFilingChecks,
} from '@/db/schema';

/**
 * 수임처(거래처) 관련 데이터 전량 삭제 — roster 재업로드 직전 초기화용.
 *
 * 보존(킵): 직원 계정·PIN·블루홀 자격증명(users), 앱 설정(app_config),
 *           블루홀 수정 로그(bluehole_sync_log), 점심·뽑기(lunch_spot_requests),
 *           안내문 템플릿(users.notice_template),
 *           상담 초안(intake_inquiries 중 extra.draft = true), 청년들 ID.
 */

/** 상담 초안(보존 대상)이 아닌 유입관리 행 조건 */
const NON_DRAFT_INQUIRY = sql`coalesce(${intakeInquiries.extra}->>'draft', '') <> 'true'`;

export type ClientDataCounts = {
  clients: number;
  clientContacts: number;
  intakeInquiries: number; // 삭제 대상(초안 제외)
  intakeInquiryDrafts: number; // 보존되는 상담 초안
  intakeProcesses: number;
  churnRecords: number;
  clientMeetings: number;
  reportDeliveries: number;
  settlementVisits: number;
  taxFilingChecks: number;
  clientFeeChanges: number;
  clientFeeImportPending: number;
};

/** 삭제될/보존될 데이터 건수 미리보기 (DB 변경 없음) */
export async function countClientData(): Promise<ClientDataCounts> {
  const db = getDb();

  const [
    clientsC,
    contactsC,
    inquiriesC,
    draftsC,
    processesC,
    churnC,
    meetingsC,
    reportsC,
    settlementsC,
    filingC,
    feeChangesC,
    feePendingC,
  ] = await Promise.all([
    db.select({ c: count() }).from(clients),
    db.select({ c: count() }).from(clientContacts),
    db.select({ c: count() }).from(intakeInquiries).where(NON_DRAFT_INQUIRY),
    db.select({ c: count() }).from(intakeInquiries).where(sql`coalesce(${intakeInquiries.extra}->>'draft', '') = 'true'`),
    db.select({ c: count() }).from(intakeProcesses),
    db.select({ c: count() }).from(churnRecords),
    db.select({ c: count() }).from(clientMeetings),
    db.select({ c: count() }).from(reportDeliveries),
    db.select({ c: count() }).from(settlementVisits),
    db.select({ c: count() }).from(taxFilingChecks),
    db.select({ c: count() }).from(clientFeeChanges),
    db.select({ c: count() }).from(clientFeeImportPending),
  ]);

  return {
    clients: clientsC[0].c,
    clientContacts: contactsC[0].c,
    intakeInquiries: inquiriesC[0].c,
    intakeInquiryDrafts: draftsC[0].c,
    intakeProcesses: processesC[0].c,
    churnRecords: churnC[0].c,
    clientMeetings: meetingsC[0].c,
    reportDeliveries: reportsC[0].c,
    settlementVisits: settlementsC[0].c,
    taxFilingChecks: filingC[0].c,
    clientFeeChanges: feeChangesC[0].c,
    clientFeeImportPending: feePendingC[0].c,
  };
}

export type ClientDataWipeResult = {
  deleted: Omit<ClientDataCounts, 'intakeInquiryDrafts'>;
  keptInquiryDrafts: number;
};

/**
 * 수임처 관련 데이터 삭제. 자식 테이블 → clients 순서로 FK 위반 없이 제거하며,
 * 상담 초안(intake_inquiries.extra.draft=true)은 보존하고 clients 참조만 끊는다.
 */
export async function wipeClientData(): Promise<ClientDataWipeResult> {
  const db = getDb();

  const before = await countClientData();

  await db.transaction(async tx => {
    await tx.delete(taxFilingChecks);
    await tx.delete(clientFeeChanges);
    await tx.delete(clientFeeImportPending);
    await tx.delete(churnRecords);
    await tx.delete(intakeProcesses);
    // 상담 초안만 보존하고 나머지 유입관리 행 삭제
    await tx.delete(intakeInquiries).where(NON_DRAFT_INQUIRY);
    await tx.delete(clientMeetings);
    await tx.delete(reportDeliveries);
    await tx.delete(settlementVisits);
    await tx.delete(clientContacts);
    // 보존된 초안이 삭제 예정 clients를 참조하면 FK 위반 → 참조 해제
    await tx
      .update(intakeInquiries)
      .set({ clientId: null })
      .where(isNotNull(intakeInquiries.clientId));
    await tx.delete(clients);
  });

  return {
    deleted: {
      clients: before.clients,
      clientContacts: before.clientContacts,
      intakeInquiries: before.intakeInquiries,
      intakeProcesses: before.intakeProcesses,
      churnRecords: before.churnRecords,
      clientMeetings: before.clientMeetings,
      reportDeliveries: before.reportDeliveries,
      settlementVisits: before.settlementVisits,
      taxFilingChecks: before.taxFilingChecks,
      clientFeeChanges: before.clientFeeChanges,
      clientFeeImportPending: before.clientFeeImportPending,
    },
    keptInquiryDrafts: before.intakeInquiryDrafts,
  };
}
