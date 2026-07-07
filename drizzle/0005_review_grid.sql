-- 검토표 패치 · 신규 행
CREATE TABLE IF NOT EXISTS review_grid_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_name text NOT NULL,
  r integer NOT NULL,
  c integer NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS review_grid_patches_sheet_rc_idx
  ON review_grid_patches (sheet_name, r, c);

CREATE TABLE IF NOT EXISTS review_grid_new_rows (
  id text PRIMARY KEY,
  owner text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT '',
  sheet_name text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_grid_new_rows_owner_idx
  ON review_grid_new_rows (owner);
