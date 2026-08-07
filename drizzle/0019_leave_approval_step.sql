-- 휴가 팀장→최종(인디) 2단 결재
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS approval_step text NOT NULL DEFAULT 'final';

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS team_lead_reviewed_by text NOT NULL DEFAULT '';

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS team_lead_reviewed_at timestamptz;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS team_lead_review_note text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS leave_requests_approval_step_idx
  ON leave_requests (status, approval_step);
