-- Initial schema for Busan branch portal
CREATE TYPE IF NOT EXISTS user_role AS ENUM ('staff', 'admin');
CREATE TYPE IF NOT EXISTS client_status AS ENUM ('intake', 'active', 'churned');
CREATE TYPE IF NOT EXISTS client_source AS ENUM ('tp_import', 'manual_intake');

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  manager TEXT NOT NULL DEFAULT '',
  representative TEXT NOT NULL DEFAULT '',
  business_no TEXT NOT NULL DEFAULT '',
  corporate_no TEXT NOT NULL DEFAULT '',
  resident_no TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  fax TEXT NOT NULL DEFAULT '',
  tax_types JSONB NOT NULL DEFAULT '[]',
  business_entity_type TEXT NOT NULL DEFAULT '',
  service_types JSONB NOT NULL DEFAULT '[]',
  status client_status NOT NULL DEFAULT 'active',
  assigned_user_id UUID REFERENCES users(id),
  intake_step INTEGER NOT NULL DEFAULT 0,
  intake_data JSONB NOT NULL DEFAULT '{}',
  source client_source NOT NULL DEFAULT 'tp_import',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS churn_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  churned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_assigned ON clients(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_name);
