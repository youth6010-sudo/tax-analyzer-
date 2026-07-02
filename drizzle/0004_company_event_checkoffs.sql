CREATE TABLE IF NOT EXISTS company_event_checkoffs (
  event_id uuid NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (event_id, member_name)
);

CREATE INDEX IF NOT EXISTS company_event_checkoffs_member_idx ON company_event_checkoffs (member_name);
