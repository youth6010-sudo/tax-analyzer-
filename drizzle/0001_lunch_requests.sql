CREATE TABLE IF NOT EXISTS lunch_spot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  note text NOT NULL DEFAULT '',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_by_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lunch_spot_requests_status_idx ON lunch_spot_requests (status, created_at DESC);
