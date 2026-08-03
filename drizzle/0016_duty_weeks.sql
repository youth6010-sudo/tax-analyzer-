CREATE TABLE IF NOT EXISTS duty_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL,
  week_start text NOT NULL,
  week_end text NOT NULL,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS duty_weeks_week_start_uidx ON duty_weeks (week_start);
CREATE INDEX IF NOT EXISTS duty_weeks_range_idx ON duty_weeks (week_start, week_end);
