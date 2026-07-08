import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS review_grid_patches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sheet_name text NOT NULL,
      r integer NOT NULL,
      c integer NOT NULL,
      value text NOT NULL DEFAULT '',
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS review_grid_patches_sheet_rc_idx
    ON review_grid_patches (sheet_name, r, c)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS review_grid_new_rows (
      id text PRIMARY KEY,
      owner text NOT NULL DEFAULT '',
      kind text NOT NULL DEFAULT '',
      sheet_name text NOT NULL DEFAULT '',
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS review_grid_new_rows_owner_idx
    ON review_grid_new_rows (owner)
  `;

  await sql`
    ALTER TABLE review_grid_patches ADD COLUMN IF NOT EXISTS bg text
  `;

  await sql`
    ALTER TABLE review_client_links ADD COLUMN IF NOT EXISTS match_method text NOT NULL DEFAULT 'manual'
  `;

  const linkTable = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'review_client_links'
  `;
  const hasLinksTable = linkTable.length > 0;
  const hasSortOrder = linkTable.some(c => c.column_name === 'sort_order');

  if (!hasLinksTable) {
    await sql`
      CREATE TABLE review_client_links (
        review_key text NOT NULL,
        client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        review_name text NOT NULL DEFAULT '',
        sort_order integer NOT NULL DEFAULT 0,
        match_method text NOT NULL DEFAULT 'manual',
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (review_key, client_id)
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_client_links_client_idx
      ON review_client_links (client_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_client_links_review_idx
      ON review_client_links (review_key)
    `;
  } else if (!hasSortOrder) {
    await sql`ALTER TABLE review_client_links RENAME TO review_client_links_old`;
    await sql`
      CREATE TABLE review_client_links (
        review_key text NOT NULL,
        client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        review_name text NOT NULL DEFAULT '',
        sort_order integer NOT NULL DEFAULT 0,
        match_method text NOT NULL DEFAULT 'manual',
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (review_key, client_id)
      )
    `;
    await sql`
      INSERT INTO review_client_links (review_key, client_id, review_name, sort_order, updated_by, updated_at)
      SELECT review_key, client_id, review_name, 0, updated_by, updated_at
      FROM review_client_links_old
    `;
    await sql`DROP TABLE review_client_links_old`;
    await sql`
      CREATE INDEX IF NOT EXISTS review_client_links_client_idx
      ON review_client_links (client_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_client_links_review_idx
      ON review_client_links (review_key)
    `;
  } else {
    await sql`
      CREATE INDEX IF NOT EXISTS review_client_links_client_idx
      ON review_client_links (client_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS review_client_links_review_idx
      ON review_client_links (review_key)
    `;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS review_grid_sheets (
      sheet_name text PRIMARY KEY,
      sheet_data jsonb NOT NULL,
      version text,
      source text,
      imported_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  console.log('review_grid tables ready');
} finally {
  await sql.end();
}
