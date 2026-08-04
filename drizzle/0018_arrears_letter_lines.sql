ALTER TABLE arrears_entries
  ADD COLUMN IF NOT EXISTS letter_date text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS arrears_letter_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arrears_entry_id uuid NOT NULL REFERENCES arrears_entries(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  amount integer NOT NULL DEFAULT 0,
  paid_amount integer NOT NULL DEFAULT 0,
  paid_date text NOT NULL DEFAULT '',
  /** letter | ledger | manual */
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arrears_letter_lines_entry_idx
  ON arrears_letter_lines (arrears_entry_id);

CREATE INDEX IF NOT EXISTS arrears_letter_lines_entry_sort_idx
  ON arrears_letter_lines (arrears_entry_id, sort_order);
