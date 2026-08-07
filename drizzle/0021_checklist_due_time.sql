-- 개인 체크리스트 마감 시각 (HH:mm)
ALTER TABLE personal_checklist_items
  ADD COLUMN IF NOT EXISTS due_time text NOT NULL DEFAULT '';
