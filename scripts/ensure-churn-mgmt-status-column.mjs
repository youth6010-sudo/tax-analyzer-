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
    ALTER TABLE arrears_entries
    ADD COLUMN IF NOT EXISTS churn_mgmt_status text NOT NULL DEFAULT ''
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS arrears_entries_churn_status_idx
    ON arrears_entries (churn_mgmt_status)
  `;
  console.log('✓ arrears_entries.churn_mgmt_status');
} catch (e) {
  console.error('마이그레이션 실패:', e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
