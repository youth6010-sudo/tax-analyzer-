CREATE TABLE IF NOT EXISTS review_grid_sheets (
  sheet_name text PRIMARY KEY,
  sheet_data jsonb NOT NULL,
  version text,
  source text,
  imported_at timestamptz NOT NULL DEFAULT now()
);
