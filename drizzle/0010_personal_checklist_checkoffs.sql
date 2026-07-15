CREATE TABLE IF NOT EXISTS personal_checklist_checkoffs (
  item_id uuid NOT NULL REFERENCES personal_checklist_items(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (item_id, member_name)
);

CREATE INDEX IF NOT EXISTS personal_checklist_checkoffs_member_idx
  ON personal_checklist_checkoffs (member_name);

CREATE TABLE IF NOT EXISTS personal_checklist_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES personal_checklist_items(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  actor_name text NOT NULL,
  kind text NOT NULL DEFAULT 'completed',
  title text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_checklist_notifications_recipient_idx
  ON personal_checklist_notifications (recipient_name, read_at, created_at DESC);
