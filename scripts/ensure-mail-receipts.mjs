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
  console.error('DATABASE_URL required (.env.local 또는 .env)');
  process.exit(1);
}

const migrationPath = path.join(root, 'drizzle', '0011_mail_receipts.sql');
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql.unsafe(fs.readFileSync(migrationPath, 'utf8'));
  console.log('✓ mail_receipts 테이블 마이그레이션 완료');
} catch (e) {
  console.error('마이그레이션 실패:', e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
