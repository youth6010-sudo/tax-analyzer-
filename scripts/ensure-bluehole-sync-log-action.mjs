// bluehole_sync_log 에 action 컬럼 + created_at 인덱스 추가 (Phase 5 감사 로그)
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
  await sql`ALTER TABLE bluehole_sync_log ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'update'`;
  await sql`CREATE INDEX IF NOT EXISTS bluehole_sync_log_created_at_idx ON bluehole_sync_log (created_at)`;
  console.log('bluehole_sync_log.action column ready');
} finally {
  await sql.end({ timeout: 5 });
}
