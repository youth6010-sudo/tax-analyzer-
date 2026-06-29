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
    CREATE TABLE IF NOT EXISTS bluehole_sync_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id text NOT NULL,
      bluehole_client_id text NOT NULL DEFAULT '',
      user_id uuid,
      user_name text NOT NULL DEFAULT '',
      changes jsonb NOT NULL DEFAULT '{}'::jsonb,
      success_cols jsonb NOT NULL DEFAULT '[]'::jsonb,
      warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS bluehole_sync_log_client_id_idx ON bluehole_sync_log (client_id)`;
  console.log('bluehole_sync_log table ready');
} finally {
  await sql.end({ timeout: 5 });
}
