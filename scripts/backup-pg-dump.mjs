/**
 * PostgreSQL 물리 덤프 (권장 본백업)
 *
 *   npm run db:backup:dump
 *   npm run db:backup:dump -- ./backups/portal.dump
 *
 * 필요: 로컬에 pg_dump (PostgreSQL 클라이언트) 설치.
 * DATABASE_URL은 .env.local 의 Supabase 연결 문자열.
 *
 * 복원 예:
 *   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" portal.dump
 *   (운영 DB에 직접 복원하지 말고, 새 DB/스테이징에서 먼저 검증)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
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
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const args = process.argv.slice(2).filter(a => a !== '--');
const now = new Date();
const stamp =
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
  `-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const outPath =
  args[0] ||
  path.join(process.env.USERPROFILE || root, 'Desktop', `tax-analyzer-pgdump-${stamp}.dump`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });

console.log('pg_dump 실행 중…');
console.log('  →', outPath);

const result = spawnSync(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-acl', '--dbname', url, '--file', outPath],
  { encoding: 'utf8', shell: true },
);

if (result.error) {
  console.error('pg_dump를 실행할 수 없습니다. PostgreSQL 클라이언트가 PATH에 있는지 확인하세요.');
  console.error(result.error.message);
  console.error('\n대안: npm run db:backup  (JSON 논리 백업)');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'pg_dump failed');
  process.exit(result.status || 1);
}

const mb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
console.log(`✓ pg_dump 저장: ${outPath} (${mb} MB)`);
console.log('보관: 사무실 NAS / OneDrive 등 앱 밖 저장소에 복사해 두세요.');
