import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userRoleEnum = pgEnum('user_role', ['staff', 'admin']);
export const clientStatusEnum = pgEnum('client_status', ['intake', 'active', 'churned']);
export const clientSourceEnum = pgEnum('client_source', ['tp_import', 'manual_intake', 'youth_excel', 'douzone_export']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  loginId: text('login_id').notNull().unique(),
  name: text('name').notNull(),
  realName: text('real_name').notNull().default(''),
  pinHash: text('pin_hash').notNull(),
  role: userRoleEnum('role').notNull().default('staff'),
  noticeTemplate: text('notice_template').notNull().default(''),
  blueholeLoginId: text('bluehole_login_id').notNull().default(''),
  blueholePasswordEnc: text('bluehole_password_enc').notNull().default(''),
  blueholeSessionCookie: text('bluehole_session_cookie').notNull().default(''),
  blueholeSessionAt: timestamp('bluehole_session_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable('clients', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyName: text('company_name').notNull(),
  manager: text('manager').notNull().default(''),
  representative: text('representative').notNull().default(''),
  businessNo: text('business_no').notNull().default(''),
  corporateNo: text('corporate_no').notNull().default(''),
  residentNo: text('resident_no').notNull().default(''),
  phone: text('phone').notNull().default(''),
  fax: text('fax').notNull().default(''),
  taxTypes: jsonb('tax_types').notNull().$type<string[]>().default([]),
  businessEntityType: text('business_entity_type').notNull().default(''),
  serviceTypes: jsonb('service_types').notNull().$type<string[]>().default([]),
  feeSummary: integer('fee_summary'),
  program: text('program').notNull().default(''),
  converted: boolean('converted').notNull().default(false),
  colbert: boolean('colbert').notNull().default(false),
  status: clientStatusEnum('status').notNull().default('active'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id),
  intakeStep: integer('intake_step').notNull().default(0),
  intakeData: jsonb('intake_data').notNull().$type<Record<string, unknown>>().default({}),
  source: clientSourceEnum('source').notNull().default('tp_import'),
  blueholeClientId: text('bluehole_client_id').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('clients_business_no_idx').on(t.businessNo),
  index('clients_manager_idx').on(t.manager),
  index('clients_assigned_user_id_idx').on(t.assignedUserId),
]);

/** 0618id 수임료 import — TP 매칭 실패 대기 */
export const clientFeeImportPending = pgTable('client_fee_import_pending', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyName: text('company_name').notNull(),
  manager: text('manager').notNull().default(''),
  feeSummary: integer('fee_summary'),
  sourceFile: text('source_file').notNull().default(''),
  excelKey: text('excel_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('client_fee_import_pending_manager_idx').on(t.manager),
]);

export const clientFeeChanges = pgTable('client_fee_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  previousFee: integer('previous_fee'),
  newFee: integer('new_fee'),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => users.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('client_fee_changes_client_id_idx').on(t.clientId),
  index('client_fee_changes_changed_at_idx').on(t.changedAt),
]);

export const churnRecords = pgTable('churn_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id),
  companyName: text('company_name').notNull().default(''),
  reason: text('reason').notNull(),
  detail: text('detail').notNull().default(''),
  churnType: text('churn_type').notNull().default(''),
  dataCleanup: text('data_cleanup').notNull().default(''),
  earlySign: text('early_sign').notNull().default(''),
  feeAmount: integer('fee_amount'),
  manager: text('manager').notNull().default(''),
  excelKey: text('excel_key').unique(),
  churnedAt: timestamp('churned_at', { withTimezone: true }).notNull().defaultNow(),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
});

/** 유입관리 시트 */
export const intakeInquiries = pgTable('intake_inquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id),
  companyName: text('company_name').notNull(),
  phone: text('phone').notNull().default(''),
  channel: text('channel').notNull().default(''),
  consultant: text('consultant').notNull().default(''),
  inquiryDate: text('inquiry_date').notNull().default(''),
  inquiryContent: text('inquiry_content').notNull().default(''),
  contractStatus: text('contract_status').notNull().default(''),
  proposedFee: integer('proposed_fee'),
  industry: text('industry').notNull().default(''),
  businessNo: text('business_no').notNull().default(''),
  representative: text('representative').notNull().default(''),
  address: text('address').notNull().default(''),
  extra: jsonb('extra').notNull().$type<Record<string, unknown>>().default({}),
  excelKey: text('excel_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 유입프로세스 시트 */
export const intakeProcesses = pgTable('intake_processes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id),
  companyName: text('company_name').notNull(),
  feeStartDate: text('fee_start_date').notNull().default(''),
  monthlyFee: integer('monthly_fee'),
  channel: text('channel').notNull().default(''),
  checklist: jsonb('checklist').notNull().$type<Record<string, boolean>>().default({}),
  excelKey: text('excel_key').notNull().unique(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 미팅 스케쥴 / 미팅스케쥴 관리 / 방문미팅 */
export const clientMeetings = pgTable('client_meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id),
  companyName: text('company_name').notNull(),
  manager: text('manager').notNull().default(''),
  sourceSheet: text('source_sheet').notNull(),
  scheduleLabel: text('schedule_label').notNull().default(''),
  trialBalanceDate: text('trial_balance_date').notNull().default(''),
  reportType: text('report_type').notNull().default(''),
  visitType: text('visit_type').notNull().default(''),
  notes: text('notes').notNull().default(''),
  feeNote: text('fee_note').notNull().default(''),
  nextSchedule: text('next_schedule').notNull().default(''),
  visitDetail: jsonb('visit_detail').notNull().$type<Record<string, unknown>>().default({}),
  excelKey: text('excel_key').notNull().unique(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 리포트 발송 확인 */
export const reportDeliveries = pgTable('report_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id),
  companyName: text('company_name').notNull(),
  businessNo: text('business_no').notNull().default(''),
  externalManager: text('external_manager').notNull().default(''),
  semoSent: boolean('semo_sent').notNull().default(false),
  contractStatus: text('contract_status').notNull().default(''),
  entityType: text('entity_type').notNull().default(''),
  taxType: text('tax_type').notNull().default(''),
  program: text('program').notNull().default(''),
  representative: text('representative').notNull().default(''),
  repPhone: text('rep_phone').notNull().default(''),
  excelKey: text('excel_key').notNull().unique(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 24년 가결산 */
export const settlementVisits = pgTable('settlement_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id),
  companyName: text('company_name').notNull(),
  branchManager: text('branch_manager').notNull().default(''),
  entityType: text('entity_type').notNull().default(''),
  visitDate: text('visit_date').notNull().default(''),
  reportFormat: text('report_format').notNull().default(''),
  excelKey: text('excel_key').notNull().unique(),
});

/** 업무 체크리스트 */
export const workChecklists = pgTable('work_checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  period: text('period').notNull(),
  weekLabel: text('week_label').notNull().default(''),
  staffName: text('staff_name').notNull(),
  checks: jsonb('checks').notNull().$type<Record<string, string>>().default({}),
  excelKey: text('excel_key').notNull().unique(),
});

/** 수임처 연락처 (업체당 다중) */
export const clientContacts = pgTable('client_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  role: text('role').notNull().default(''),
  phone: text('phone').notNull().default(''),
  mobilePhone: text('mobile_phone').notNull().default(''),
  contactKind: text('contact_kind').notNull().default(''),
  isPrimary: boolean('is_primary').notNull().default(false),
  source: text('source').notNull().default('manual'),
  excelKey: text('excel_key').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('client_contacts_client_id_idx').on(t.clientId),
]);

/** 세무 신고 통합 케이스 보드 (지점·세목·기간당 1건) */
export const taxFilingChecks = pgTable(
  'tax_filing_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull().default('branch'),
    taxType: text('tax_type').notNull(),
    periodKey: text('period_key').notNull(),
    status: text('status').notNull().default('pending'),
    blueholeCaseId: text('bluehole_case_id').notNull().default(''),
    acceptanceCount: integer('acceptance_count'),
    notes: text('notes').notNull().default(''),
    checkedBy: text('checked_by').notNull().default(''),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('tax_filing_checks_client_scope_period_idx').on(t.clientId, t.scope, t.taxType, t.periodKey)],
);

/** 점심 맛집 추가 요청 큐 */
export const lunchSpotRequests = pgTable('lunch_spot_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  note: text('note').notNull().default(''),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  requestedByName: text('requested_by_name').notNull().default(''),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ClientFeeImportPending = typeof clientFeeImportPending.$inferSelect;
export type ClientFeeChange = typeof clientFeeChanges.$inferSelect;
export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ChurnRecord = typeof churnRecords.$inferSelect;
export type ClientContact = typeof clientContacts.$inferSelect;
export type TaxFilingCheck = typeof taxFilingChecks.$inferSelect;
export type LunchSpotRequest = typeof lunchSpotRequests.$inferSelect;
