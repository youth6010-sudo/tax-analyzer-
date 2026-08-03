CREATE TABLE IF NOT EXISTS arrears_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  external_code text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  business_no text NOT NULL DEFAULT '',
  representative text NOT NULL DEFAULT '',
  balance integer NOT NULL DEFAULT 0,
  carry_in integer NOT NULL DEFAULT 0,
  debit integer NOT NULL DEFAULT 0,
  credit integer NOT NULL DEFAULT 0,
  manager_name text NOT NULL DEFAULT '',
  /** recovery | bad | long | temp | cms | '' */
  mgmt_category text NOT NULL DEFAULT '',
  cms_note text NOT NULL DEFAULT '',
  memo text NOT NULL DEFAULT '',
  as_of_date text NOT NULL DEFAULT '',
  /** ledger | manual | status_seed */
  source text NOT NULL DEFAULT 'ledger',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arrears_entries_external_code_uidx
  ON arrears_entries (external_code);

CREATE INDEX IF NOT EXISTS arrears_entries_manager_idx ON arrears_entries (manager_name);
CREATE INDEX IF NOT EXISTS arrears_entries_category_idx ON arrears_entries (mgmt_category);
CREATE INDEX IF NOT EXISTS arrears_entries_balance_idx ON arrears_entries (balance);
CREATE INDEX IF NOT EXISTS arrears_entries_client_id_idx ON arrears_entries (client_id);
CREATE INDEX IF NOT EXISTS arrears_entries_business_no_idx ON arrears_entries (business_no);
