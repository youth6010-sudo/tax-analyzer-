-- review_client_links: 1:1 PK → (review_key, client_id) 복합 PK + sort_order
CREATE TABLE IF NOT EXISTS review_client_links_v2 (
  review_key text NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  review_name text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_key, client_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'review_client_links'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'review_client_links' AND column_name = 'sort_order'
  ) THEN
    INSERT INTO review_client_links_v2 (review_key, client_id, review_name, sort_order, updated_by, updated_at)
    SELECT review_key, client_id, review_name, 0, updated_by, updated_at
    FROM review_client_links
    ON CONFLICT DO NOTHING;
    DROP TABLE review_client_links;
    ALTER TABLE review_client_links_v2 RENAME TO review_client_links;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'review_client_links'
  ) THEN
    ALTER TABLE review_client_links_v2 RENAME TO review_client_links;
  ELSE
    DROP TABLE IF EXISTS review_client_links_v2;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS review_client_links_client_idx ON review_client_links (client_id);
CREATE INDEX IF NOT EXISTS review_client_links_review_idx ON review_client_links (review_key);
