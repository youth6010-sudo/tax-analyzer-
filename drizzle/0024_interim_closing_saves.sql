CREATE TABLE IF NOT EXISTS interim_closing_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT '',
  year integer NOT NULL,
  base_month integer NOT NULL DEFAULT 6,
  manager text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_by text NOT NULL DEFAULT '',
  saved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interim_closing_saves_client_year_idx
  ON interim_closing_saves (client_id, year);

CREATE INDEX IF NOT EXISTS interim_closing_saves_saved_at_idx
  ON interim_closing_saves (saved_at DESC);
