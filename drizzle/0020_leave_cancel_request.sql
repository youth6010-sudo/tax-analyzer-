-- 승인 후 취소 요청 (인디 별도 결재)
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS cancel_request_note text NOT NULL DEFAULT '';

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS cancel_request_from_status text NOT NULL DEFAULT '';
