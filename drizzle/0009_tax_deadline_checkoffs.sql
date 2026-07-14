CREATE TABLE IF NOT EXISTS tax_deadline_checkoffs (
  deadline_id text NOT NULL,
  member_name text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (deadline_id, member_name)
);

CREATE INDEX IF NOT EXISTS tax_deadline_checkoffs_member_idx ON tax_deadline_checkoffs (member_name);
