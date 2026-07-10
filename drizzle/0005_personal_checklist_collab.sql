ALTER TABLE personal_checklist_items
  ADD COLUMN IF NOT EXISTS assignee_names jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE personal_checklist_items
  ADD COLUMN IF NOT EXISTS memos jsonb NOT NULL DEFAULT '[]'::jsonb;
