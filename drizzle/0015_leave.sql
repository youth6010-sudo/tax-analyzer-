CREATE TABLE IF NOT EXISTS leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL,
  year integer NOT NULL,
  hire_date text NOT NULL DEFAULT '',
  resign_date text NOT NULL DEFAULT '',
  use_hire_date_basis boolean NOT NULL DEFAULT false,
  accrued text NOT NULL DEFAULT '0',
  carry_over text NOT NULL DEFAULT '0',
  increase text NOT NULL DEFAULT '0',
  decrease text NOT NULL DEFAULT '0',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_member_year_uidx
  ON leave_balances (member_name, year);
CREATE INDEX IF NOT EXISTS leave_balances_year_idx ON leave_balances (year);

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  leave_kind text NOT NULL DEFAULT 'full',
  half_slot text NOT NULL DEFAULT '',
  start_date text NOT NULL,
  end_date text NOT NULL,
  days text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'pending',
  review_note text NOT NULL DEFAULT '',
  reviewed_by text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_requests_applicant_idx ON leave_requests (applicant_name, status);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests (status);
CREATE INDEX IF NOT EXISTS leave_requests_dates_idx ON leave_requests (start_date, end_date);

CREATE TABLE IF NOT EXISTS leave_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  actor_name text NOT NULL,
  title text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_notifications_recipient_idx
  ON leave_notifications (recipient_name, read_at, created_at);

