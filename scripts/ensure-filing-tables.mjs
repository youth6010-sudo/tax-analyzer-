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
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`ALTER TABLE tax_filing_checks ADD COLUMN IF NOT EXISTS excluded_reason text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE tax_filing_checks ADD COLUMN IF NOT EXISTS income_type_flags jsonb NOT NULL DEFAULT '{}'::jsonb`;

  await sql`
    CREATE TABLE IF NOT EXISTS filing_check_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      manager text NOT NULL DEFAULT '',
      tax_type text NOT NULL,
      period_key text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS filing_check_sessions_mgr_tax_period_idx
    ON filing_check_sessions (manager, tax_type, period_key)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS simple_payroll_filings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      period_key text NOT NULL,
      income_type text NOT NULL,
      filed boolean NOT NULL DEFAULT false,
      acceptance_date text NOT NULL DEFAULT '',
      acceptance_method text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      updated_by text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS simple_payroll_filings_client_period_type_idx
    ON simple_payroll_filings (client_id, period_key, income_type)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS simple_payroll_filings_period_idx
    ON simple_payroll_filings (period_key)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS year_end_filings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      year integer NOT NULL,
      income_type text NOT NULL,
      filed boolean NOT NULL DEFAULT false,
      notes text NOT NULL DEFAULT '',
      updated_by text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS year_end_filings_client_year_type_idx
    ON year_end_filings (client_id, year, income_type)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS year_end_filings_year_idx
    ON year_end_filings (year)
  `;

  console.log('filing tables ready');
} finally {
  await sql.end({ timeout: 5 });
}
