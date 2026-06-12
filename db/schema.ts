import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ChurnRecord = typeof churnRecords.$inferSelect;
