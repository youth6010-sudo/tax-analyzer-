CREATE TABLE IF NOT EXISTS personal_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name text NOT NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  tax_type text NOT NULL DEFAULT '',
  due_date text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  reflect_in_notes boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_checklist_owner_idx ON personal_checklist_items (owner_name, completed);
CREATE INDEX IF NOT EXISTS personal_checklist_client_idx ON personal_checklist_items (client_id);

CREATE TABLE IF NOT EXISTS company_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  start_date text NOT NULL,
  end_date text NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_events_start_idx ON company_events (start_date);
