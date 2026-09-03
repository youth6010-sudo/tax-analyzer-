-- 휴가 신청 업무대체자
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS substitute_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS leave_requests_substitute_idx
  ON leave_requests (substitute_name, status, start_date, end_date);
