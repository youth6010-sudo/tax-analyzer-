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

const migrationPaths = [
  path.join(root, 'drizzle', '0002_calendar.sql'),
  path.join(root, 'drizzle', '0003_company_schedule_kind.sql'),
  path.join(root, 'drizzle', '0004_company_event_checkoffs.sql'),
  path.join(root, 'drizzle', '0005_personal_checklist_collab.sql'),
  path.join(root, 'drizzle', '0009_tax_deadline_checkoffs.sql'),
];

const sql = postgres(url, { max: 1, prepare: false });

try {
  for (const migrationPath of migrationPaths) {
    if (!fs.existsSync(migrationPath)) continue;
    await sql.unsafe(fs.readFileSync(migrationPath, 'utf8'));
  }
  console.log('✓ 캘린더 테이블 마이그레이션 완료 (personal_checklist_items, company_events)');
} catch (e) {
  console.error('마이그레이션 실패:', e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
