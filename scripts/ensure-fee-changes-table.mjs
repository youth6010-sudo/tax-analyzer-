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
    CREATE TABLE IF NOT EXISTS client_fee_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      previous_fee integer,
      new_fee integer,
      changed_by_user_id uuid NOT NULL REFERENCES users(id),
      changed_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS client_fee_changes_client_id_idx ON client_fee_changes (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS client_fee_changes_changed_at_idx ON client_fee_changes (changed_at)`;
  console.log('client_fee_changes table ready');
} finally {
  await sql.end({ timeout: 5 });
}
