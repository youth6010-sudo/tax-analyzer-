ALTER TABLE personal_checklist_items
  ADD COLUMN IF NOT EXISTS repeat_series_id uuid;
CREATE INDEX IF NOT EXISTS personal_checklist_series_idx
  ON personal_checklist_items (repeat_series_id);
