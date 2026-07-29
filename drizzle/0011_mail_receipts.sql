CREATE TABLE IF NOT EXISTS mail_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  received_at text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  memo text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_receipts_client_id_idx ON mail_receipts (client_id);
CREATE INDEX IF NOT EXISTS mail_receipts_received_at_idx ON mail_receipts (received_at);
