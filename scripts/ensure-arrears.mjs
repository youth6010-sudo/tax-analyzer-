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
const migrationPath = path.join(root, 'drizzle', '0017_arrears.sql');

try {
  // 이전 uuid FK 시도로 테이블만 생성된 경우 정리
  const cols = await sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'arrears_entries'
      AND column_name = 'client_id'
  `;
  if (cols.length && cols[0].data_type === 'uuid') {
    await sql.unsafe('DROP TABLE IF EXISTS arrears_entries CASCADE');
    console.log('dropped legacy uuid client_id table');
  }

  await sql.unsafe(fs.readFileSync(migrationPath, 'utf8'));

  // 부분 유니크 → 전체 유니크로 정렬 (ON CONFLICT 호환)
  const idx = await sql`
    SELECT pg_get_indexdef(i.indexrelid) AS def
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'arrears_entries_external_code_uidx'
  `;
  if (idx.length && /WHERE/i.test(idx[0].def || '')) {
    await sql.unsafe('DROP INDEX IF EXISTS arrears_entries_external_code_uidx');
    await sql.unsafe(
      'CREATE UNIQUE INDEX arrears_entries_external_code_uidx ON arrears_entries (external_code)',
    );
    console.log('rebuilt full unique index on external_code');
  }

  console.log('✓ arrears_entries');
} catch (e) {
  console.error('마이그레이션 실패:', e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
