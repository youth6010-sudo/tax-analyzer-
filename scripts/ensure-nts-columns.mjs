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
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nts_status text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nts_status_code text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nts_tax_type text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nts_closed_date text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS nts_checked_at timestamptz`;
  console.log('nts columns ready (clients)');
} finally {
  await sql.end({ timeout: 5 });
}
