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
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 블루홀 거래처 수정 반영 로그 (Phase 2) */
export const blueholeSyncLog = pgTable('bluehole_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').notNull(),
  blueholeClientId: text('bluehole_client_id').notNull().default(''),
  // 작업 유형: create(생성) | update(수정) | link(연결) | unlink(해제)
  action: text('action').notNull().default('update'),
  userId: uuid('user_id'),
  userName: text('user_name').notNull().default(''),
  changes: jsonb('changes').notNull().$type<Record<string, string>>().default({}),
  successCols: jsonb('success_cols').notNull().$type<string[]>().default([]),
  warnings: jsonb('warnings').notNull().$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('bluehole_sync_log_client_id_idx').on(t.clientId),
  index('bluehole_sync_log_created_at_idx').on(t.createdAt),
]);

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
  /** 사이드바·헤더 메뉴 표시/순서 개인화 */
  menuPrefs: jsonb('menu_prefs').notNull().$type<Record<string, unknown>>().default({}),
  blueholeLoginId: text('bluehole_login_id').notNull().default(''),
  blueholePasswordEnc: text('bluehole_password_enc').notNull().default(''),
  blueholeSessionCookie: text('bluehole_session_cookie').notNull().default(''),
  blueholeSessionAt: timestamp('bluehole_session_at', { withTimezone: true }),
  /** 포털 접속 heartbeat — 최근 시각으로 온라인 여부 판별 */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
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
  ntsStatus: text('nts_status').notNull().default(''),
  ntsStatusCode: text('nts_status_code').notNull().default(''),
  ntsTaxType: text('nts_tax_type').notNull().default(''),
  ntsClosedDate: text('nts_closed_date').notNull().default(''),
  ntsCheckedAt: timestamp('nts_checked_at', { withTimezone: true }),
  /** 휴업(02) 알림 확인 — 유출 없이 닫기 */
  ntsAlertAckedAt: timestamp('nts_alert_acked_at', { withTimezone: true }),
  ntsAlertAckedCode: text('nts_alert_acked_code').notNull().default(''),
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
    excludedReason: text('excluded_reason').notNull().default(''),
    incomeTypeFlags: jsonb('income_type_flags').notNull().$type<Record<string, boolean>>().default({}),
    checkedBy: text('checked_by').notNull().default(''),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('tax_filing_checks_client_scope_period_idx').on(t.clientId, t.scope, t.taxType, t.periodKey)],
);

/** 신고대상확인 세션 — 담당자·세목·기간당 1건 (localStorage 대체) */
export const filingCheckSessions = pgTable(
  'filing_check_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manager: text('manager').notNull().default(''),
    taxType: text('tax_type').notNull(),
    periodKey: text('period_key').notNull(),
    data: jsonb('data').notNull().$type<Record<string, unknown>>().default({}),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('filing_check_sessions_mgr_tax_period_idx').on(t.manager, t.taxType, t.periodKey)],
);

/** 간이지급명세서 신고 체크 — 업체·기간·소득유형별 */
export const simplePayrollFilings = pgTable(
  'simple_payroll_filings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    periodKey: text('period_key').notNull(),
    incomeType: text('income_type').notNull(),
    filed: boolean('filed').notNull().default(false),
    acceptanceDate: text('acceptance_date').notNull().default(''),
    acceptanceMethod: text('acceptance_method').notNull().default(''),
    notes: text('notes').notNull().default(''),
    updatedBy: text('updated_by').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('simple_payroll_filings_client_period_type_idx').on(
      t.clientId,
      t.periodKey,
      t.incomeType,
    ),
    index('simple_payroll_filings_period_idx').on(t.periodKey),
  ],
);

/** 연말정산 신고 체크 — 업체·연도·소득유형별 */
export const yearEndFilings = pgTable(
  'year_end_filings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    incomeType: text('income_type').notNull(),
    filed: boolean('filed').notNull().default(false),
    notes: text('notes').notNull().default(''),
    updatedBy: text('updated_by').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('year_end_filings_client_year_type_idx').on(t.clientId, t.year, t.incomeType),
    index('year_end_filings_year_idx').on(t.year),
  ],
);

/** 개인 체크리스트 (캘린더·할 일) — 담당자·메모로 공동 업무 */
export const personalChecklistItems = pgTable('personal_checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerName: text('owner_name').notNull(),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  category: text('category').notNull().default('other'),
  taxType: text('tax_type').notNull().default(''),
  dueDate: text('due_date').notNull().default(''),
  /** HH:mm — 비우면 종일 */
  dueTime: text('due_time').notNull().default(''),
  completed: boolean('completed').notNull().default(false),
  reflectInNotes: boolean('reflect_in_notes').notNull().default(false),
  /** 공동 담당자(작성자 제외 가능) */
  assigneeNames: jsonb('assignee_names').notNull().$type<string[]>().default([]),
  /** 메모 — 작성자·시각 포함 */
  memos: jsonb('memos')
    .notNull()
    .$type<{ id: string; authorName: string; body: string; createdAt: string }[]>()
    .default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  /** 일괄 반복 등록 시 동일 UUID — 시리즈 전체 삭제용 */
  repeatSeriesId: uuid('repeat_series_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('personal_checklist_owner_idx').on(t.ownerName, t.completed),
  index('personal_checklist_client_idx').on(t.clientId),
  index('personal_checklist_series_idx').on(t.repeatSeriesId),
]);

/** 개인 체크리스트 — 담당자별 완료 체크 (공동 업무) */
export const personalChecklistCheckoffs = pgTable('personal_checklist_checkoffs', {
  itemId: uuid('item_id').notNull().references(() => personalChecklistItems.id, { onDelete: 'cascade' }),
  memberName: text('member_name').notNull(),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  /** 본인 목록에서 「확인」으로 숨긴 시각 (계정별) */
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.itemId, t.memberName] }),
  index('personal_checklist_checkoffs_member_idx').on(t.memberName),
]);

/** 개인 체크리스트 — 작성자 완료 알림 */
export const personalChecklistNotifications = pgTable('personal_checklist_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => personalChecklistItems.id, { onDelete: 'cascade' }),
  recipientName: text('recipient_name').notNull(),
  actorName: text('actor_name').notNull(),
  kind: text('kind').notNull().default('completed'),
  title: text('title').notNull().default(''),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('personal_checklist_notifications_recipient_idx').on(t.recipientName, t.readAt, t.createdAt),
]);

/** 사내 일정 (캘린더) */
export const companyEvents = pgTable('company_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  scheduleKind: text('schedule_kind').notNull().default('range'),
  allDay: boolean('all_day').notNull().default(true),
  createdBy: text('created_by').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('company_events_start_idx').on(t.startDate),
]);

/** 회사 일정 — 담당자별 완료 체크 */
export const companyEventCheckoffs = pgTable('company_event_checkoffs', {
  eventId: uuid('event_id').notNull().references(() => companyEvents.id, { onDelete: 'cascade' }),
  memberName: text('member_name').notNull(),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.eventId, t.memberName] }),
  index('company_event_checkoffs_member_idx').on(t.memberName),
]);

/** 세무신고 자동일정 — 담당자별 완료 체크 (deadline_id = tax-… 고정 키) */
export const taxDeadlineCheckoffs = pgTable('tax_deadline_checkoffs', {
  deadlineId: text('deadline_id').notNull(),
  memberName: text('member_name').notNull(),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.deadlineId, t.memberName] }),
  index('tax_deadline_checkoffs_member_idx').on(t.memberName),
]);

/** 검토표 셀 패치 (마스터 편집) */
export const reviewGridPatches = pgTable(
  'review_grid_patches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetName: text('sheet_name').notNull(),
    r: integer('r').notNull(),
    c: integer('c').notNull(),
    value: text('value').notNull().default(''),
    bg: text('bg'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('review_grid_patches_sheet_rc_idx').on(t.sheetName, t.r, t.c)],
);

/** 검토표 신규 행 (마스터 추가) */
export const reviewGridNewRows = pgTable(
  'review_grid_new_rows',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull().default(''),
    kind: text('kind').notNull().default(''),
    sheetName: text('sheet_name').notNull().default(''),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('review_grid_new_rows_owner_idx').on(t.owner)],
);

/** 검토표 엑셀 시트 원본 (Supabase jsonb — 시트별 조회) */
export const reviewGridSheets = pgTable('review_grid_sheets', {
  sheetName: text('sheet_name').primaryKey(),
  sheetData: jsonb('sheet_data').notNull().$type<Record<string, unknown>>(),
  version: text('version'),
  source: text('source'),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 검토표 업체 인덱스 캐시 (Admin·자동연결용) */
export const reviewCompanyIndexCache = pgTable('review_company_index_cache', {
  id: text('id').primaryKey().default('default'),
  builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
  entryCount: integer('entry_count').notNull().default(0),
  entries: jsonb('entries').notNull().$type<unknown[]>().default([]),
});

/** 검토표 ↔ 수임처 수동 연결 (찰리 관리, 1:N) */
export const reviewClientLinks = pgTable(
  'review_client_links',
  {
    reviewKey: text('review_key').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    reviewName: text('review_name').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    matchMethod: text('match_method').notNull().default('manual'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.reviewKey, t.clientId] }),
    index('review_client_links_client_idx').on(t.clientId),
    index('review_client_links_review_idx').on(t.reviewKey),
  ],
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

/** 우편물·증빙 대장 (수임처별 영수증/사진) */
export const mailReceipts = pgTable('mail_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  receivedAt: text('received_at').notNull().default(''),
  title: text('title').notNull().default(''),
  /** { id, label, authorName, createdAt }[] — 레거시 string[]도 읽기 시 변환 */
  tags: jsonb('tags').notNull().$type<unknown[]>().default([]),
  /** { id, authorName, body, createdAt }[] */
  memos: jsonb('memos').notNull().$type<unknown[]>().default([]),
  /** 검색용 — memos body 합본 */
  memo: text('memo').notNull().default(''),
  images: jsonb('images')
    .notNull()
    .$type<{ id: string; name: string; contentType: string; dataUrl: string }[]>()
    .default([]),
  createdByName: text('created_by_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('mail_receipts_client_id_idx').on(t.clientId),
  index('mail_receipts_received_at_idx').on(t.receivedAt),
]);

/** 연도별 개인 연차 잔고 — 발생/이월/증감은 페리·인디 수동 입력 */
export const leaveBalances = pgTable('leave_balances', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberName: text('member_name').notNull(),
  year: integer('year').notNull(),
  hireDate: text('hire_date').notNull().default(''),
  resignDate: text('resign_date').notNull().default(''),
  useHireDateBasis: boolean('use_hire_date_basis').notNull().default(false),
  accrued: text('accrued').notNull().default('0'),
  carryOver: text('carry_over').notNull().default('0'),
  increase: text('increase').notNull().default('0'),
  decrease: text('decrease').notNull().default('0'),
  updatedBy: text('updated_by').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('leave_balances_member_year_uidx').on(t.memberName, t.year),
  index('leave_balances_year_idx').on(t.year),
]);

/** 휴가 신청·결재 — 승인은 인디만 */
export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicantName: text('applicant_name').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  /** full | half */
  leaveKind: text('leave_kind').notNull().default('full'),
  /** am | pm | '' (연차) */
  halfSlot: text('half_slot').notNull().default(''),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  /** 사용 일수 문자열 (0.5, 1, 2 …) */
  days: text('days').notNull().default('1'),
  /** pending | approved | rejected | cancelled | cancel_requested */
  status: text('status').notNull().default('pending'),
  /** team_lead | final — 현재 결재 단계 */
  approvalStep: text('approval_step').notNull().default('final'),
  teamLeadReviewedBy: text('team_lead_reviewed_by').notNull().default(''),
  teamLeadReviewedAt: timestamp('team_lead_reviewed_at', { withTimezone: true }),
  teamLeadReviewNote: text('team_lead_review_note').notNull().default(''),
  reviewNote: text('review_note').notNull().default(''),
  reviewedBy: text('reviewed_by').notNull().default(''),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  /** 승인 후 취소 요청 */
  cancelRequestNote: text('cancel_request_note').notNull().default(''),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  /** approved | pending — 취소 요청 전 상태 (반려 시 복원) */
  cancelRequestFromStatus: text('cancel_request_from_status').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('leave_requests_applicant_idx').on(t.applicantName, t.status),
  index('leave_requests_status_idx').on(t.status),
  index('leave_requests_dates_idx').on(t.startDate, t.endDate),
  index('leave_requests_approval_step_idx').on(t.status, t.approvalStep),
]);

/** 휴가 신청 알림 (결재자·신청자) */
export const leaveNotifications = pgTable('leave_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaveRequestId: uuid('leave_request_id')
    .notNull()
    .references(() => leaveRequests.id, { onDelete: 'cascade' }),
  recipientName: text('recipient_name').notNull(),
  actorName: text('actor_name').notNull(),
  title: text('title').notNull().default(''),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('leave_notifications_recipient_idx').on(t.recipientName, t.readAt, t.createdAt),
]);

/** 주간 당번 (월~금) */
export const dutyWeeks = pgTable('duty_weeks', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberName: text('member_name').notNull(),
  weekStart: text('week_start').notNull(),
  weekEnd: text('week_end').notNull(),
  createdBy: text('created_by').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('duty_weeks_week_start_uidx').on(t.weekStart),
  index('duty_weeks_range_idx').on(t.weekStart, t.weekEnd),
]);

/** 미수 잔액 — 세무사랑 거래처원장 기준 (담당·분류·메모는 원장 재가져오기 시 유지) */
export const arrearsEntries = pgTable('arrears_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  externalCode: text('external_code').notNull().default(''),
  companyName: text('company_name').notNull().default(''),
  businessNo: text('business_no').notNull().default(''),
  representative: text('representative').notNull().default(''),
  balance: integer('balance').notNull().default(0),
  carryIn: integer('carry_in').notNull().default(0),
  debit: integer('debit').notNull().default(0),
  credit: integer('credit').notNull().default(0),
  managerName: text('manager_name').notNull().default(''),
  /** recovery | bad | long | temp | cms | '' */
  mgmtCategory: text('mgmt_category').notNull().default(''),
  cmsNote: text('cms_note').notNull().default(''),
  memo: text('memo').notNull().default(''),
  asOfDate: text('as_of_date').notNull().default(''),
  /** 공문 작성일 표시용 (예: 2026.07.27). 없으면 asOfDate 사용 */
  letterDate: text('letter_date').notNull().default(''),
  /** ledger | manual | status_seed | status | letter */
  source: text('source').notNull().default('ledger'),
  updatedBy: text('updated_by').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('arrears_entries_external_code_uidx').on(t.externalCode),
  index('arrears_entries_manager_idx').on(t.managerName),
  index('arrears_entries_category_idx').on(t.mgmtCategory),
  index('arrears_entries_balance_idx').on(t.balance),
  index('arrears_entries_client_id_idx').on(t.clientId),
  index('arrears_entries_business_no_idx').on(t.businessNo),
]);

/** 업체별 미수 공문 내역 행 */
export const arrearsLetterLines = pgTable('arrears_letter_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  arrearsEntryId: uuid('arrears_entry_id')
    .notNull()
    .references(() => arrearsEntries.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  description: text('description').notNull().default(''),
  amount: integer('amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  paidDate: text('paid_date').notNull().default(''),
  /** letter | ledger | manual */
  source: text('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('arrears_letter_lines_entry_idx').on(t.arrearsEntryId),
  index('arrears_letter_lines_entry_sort_idx').on(t.arrearsEntryId, t.sortOrder),
]);

export type ClientFeeImportPending = typeof clientFeeImportPending.$inferSelect;
export type ClientFeeChange = typeof clientFeeChanges.$inferSelect;
export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ChurnRecord = typeof churnRecords.$inferSelect;
export type ClientContact = typeof clientContacts.$inferSelect;
export type TaxFilingCheck = typeof taxFilingChecks.$inferSelect;
export type FilingCheckSession = typeof filingCheckSessions.$inferSelect;
export type SimplePayrollFiling = typeof simplePayrollFilings.$inferSelect;
export type YearEndFiling = typeof yearEndFilings.$inferSelect;
export type LunchSpotRequest = typeof lunchSpotRequests.$inferSelect;
export type MailReceipt = typeof mailReceipts.$inferSelect;
export type PersonalChecklistItem = typeof personalChecklistItems.$inferSelect;
export type PersonalChecklistCheckoff = typeof personalChecklistCheckoffs.$inferSelect;
export type PersonalChecklistNotification = typeof personalChecklistNotifications.$inferSelect;
export type CompanyEvent = typeof companyEvents.$inferSelect;
export type CompanyEventCheckoff = typeof companyEventCheckoffs.$inferSelect;
export type TaxDeadlineCheckoff = typeof taxDeadlineCheckoffs.$inferSelect;
export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type LeaveNotification = typeof leaveNotifications.$inferSelect;
export type DutyWeek = typeof dutyWeeks.$inferSelect;
export type ArrearsEntry = typeof arrearsEntries.$inferSelect;
export type ArrearsLetterLine = typeof arrearsLetterLines.$inferSelect;
export type ReviewGridPatch = typeof reviewGridPatches.$inferSelect;
export type ReviewClientLink = typeof reviewClientLinks.$inferSelect;
export type ReviewGridNewRow = typeof reviewGridNewRows.$inferSelect;
export type ReviewGridSheet = typeof reviewGridSheets.$inferSelect;
