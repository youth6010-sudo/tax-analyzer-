import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('NO_DATABASE_URL');
  process.exit(1);
}

let host = '(parse-fail)';
try {
  host = new URL(url.replace(/^postgres(ql)?:/i, 'https:')).host;
} catch {
  /* ignore */
}
console.log('HOST', host);

/** schema.ts 기준 핵심 테이블 */
const expectedTables = [
  'app_config',
  'bluehole_sync_log',
  'users',
  'clients',
  'client_fee_import_pending',
  'client_fee_changes',
  'churn_records',
  'intake_inquiries',
  'intake_processes',
  'client_meetings',
  'report_deliveries',
  'settlement_visits',
  'work_checklists',
  'client_contacts',
  'tax_filing_checks',
  'filing_check_sessions',
  'simple_payroll_filings',
  'year_end_filings',
  'personal_checklist_items',
  'personal_checklist_checkoffs',
  'personal_checklist_notifications',
  'company_events',
  'company_event_checkoffs',
  'tax_deadline_checkoffs',
  'review_grid_patches',
  'review_grid_new_rows',
  'review_grid_sheets',
  'review_company_index_cache',
  'review_client_links',
  'lunch_spot_requests',
  'mail_receipts',
];

const expectedColumns = [
  ['users', 'menu_prefs'],
  ['users', 'notice_template'],
  ['users', 'bluehole_login_id'],
  ['users', 'bluehole_password_enc'],
  ['users', 'bluehole_session_cookie'],
  ['users', 'bluehole_session_at'],
  ['clients', 'nts_status'],
  ['clients', 'nts_checked_at'],
  ['bluehole_sync_log', 'action'],
  ['personal_checklist_items', 'tax_type'],
  ['company_events', 'schedule_kind'],
  ['tax_filing_checks', 'excluded_reason'],
  ['tax_filing_checks', 'income_type_flags'],
];

const sql = postgres(url, { max: 1, prepare: false });

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const tableSet = new Set(tables.map(r => r.table_name));

  const cols = await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const colSet = new Set(cols.map(r => `${r.table_name}.${r.column_name}`));

  console.log('\n=== MISSING TABLES ===');
  let missT = 0;
  for (const t of expectedTables) {
    if (!tableSet.has(t)) {
      console.log('-', t);
      missT += 1;
    }
  }
  if (!missT) console.log('(none)');

  console.log('\n=== MISSING COLUMNS ===');
  let missC = 0;
  for (const [t, c] of expectedColumns) {
    const key = `${t}.${c}`;
    if (!colSet.has(key)) {
      console.log('-', key);
      missC += 1;
    }
  }
  if (!missC) console.log('(none)');

  console.log(`\nSUMMARY missing_tables=${missT} missing_columns=${missC}`);
  console.log(`public_tables_total=${tableSet.size}`);
} finally {
  await sql.end({ timeout: 5 });
}
