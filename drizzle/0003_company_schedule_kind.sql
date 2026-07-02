ALTER TABLE company_events
  ADD COLUMN IF NOT EXISTS schedule_kind text NOT NULL DEFAULT 'range';
