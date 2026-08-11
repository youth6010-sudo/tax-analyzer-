/**
 * Supabase 유료 결제·컷오버 전 준비
 *
 *   npm run db:prep-supabase
 *
 * - 현재 DATABASE_URL 호스트 확인
 * - public 테이블 행수 베이스라인 → backups/
 * - pg_dump / JSON 백업 안내
 * - 결제 후 컷오버 체크리스트 출력
 *
 * 데이터 이전·env 교체는 하지 않습니다 (결제 후 별도 실행).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return '(invalid)';
  }
}

function providerOf(host) {
  if (/neon\.tech/i.test(host)) return 'neon';
  if (/supabase/i.test(host)) return 'supabase';
  return 'other';
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required (.env.local)');
  process.exit(1);
}

const host = hostOf(url);
const provider = providerOf(host);
const now = new Date();
const stamp =
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
  `-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

const backupsDir = path.join(root, 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

console.log('=== Supabase 컷오버 전 준비 ===');
console.log('현재 DB:', host, `(${provider})`);
if (provider === 'supabase') {
  console.log('이미 Supabase를 가리키고 있습니다. 베이스라인만 저장합니다.');
} else if (provider !== 'neon') {
  console.warn('경고: Neon/Supabase가 아닌 호스트입니다. 계속 진행합니다.');
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });
let baseline;
try {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const counts = {};
  let total = 0;
  for (const { table_name } of tables) {
    const q = `"${String(table_name).replace(/"/g, '""')}"`;
    const [{ n }] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${q}`);
    counts[table_name] = n;
    total += n;
  }

  baseline = {
    createdAt: now.toISOString(),
    purpose: 'pre-supabase-cutover',
    host,
    provider,
    tableCount: tables.length,
    rowTotal: total,
    counts,
  };

  const baselinePath = path.join(backupsDir, `pre-supabase-baseline-${stamp}.json`);
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
  console.log(`✓ 행수 베이스라인: ${baselinePath}`);
  console.log(`  테이블 ${baseline.tableCount}개 / 행 합계 ${baseline.rowTotal.toLocaleString()}`);

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  console.log('  TOP:');
  for (const [name, n] of top) {
    console.log(`    ${name}: ${n.toLocaleString()}`);
  }
} catch (e) {
  console.error('베이스라인 실패:', e.message || e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 3 });
}

const pgDump = spawnSync('pg_dump', ['--version'], { encoding: 'utf8', shell: true });
const hasPgDump = !pgDump.error && pgDump.status === 0;
console.log('');
console.log('pg_dump:', hasPgDump ? String(pgDump.stdout || '').trim() : '없음 (PATH에 없음)');

console.log(`
--- 지금 이어서 권장 백업 ---
  npm run db:backup -- ./backups/pre-supabase-${stamp}.json
  npm run db:backup:dump -- ./backups/pre-supabase-${stamp}.dump
  ${hasPgDump ? '(pg_dump 사용 가능)' : '→ pg_dump 없으면 JSON만 받아도 됨. 결제 전에 PostgreSQL 클라이언트 설치 권장.'}

--- 결제 시 (대시보드에서) ---
  1. Supabase Pro (또는 팀 플랜) 결제
  2. 프로젝트 리전: Northeast Asia (Seoul) — 반드시 서울
  3. Database → Connection string → URI (Transaction pooler :6543 권장)
     예: postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
  4. .env.local 에 임시로 추가 (아직 active DATABASE_URL은 바꾸지 말 것):
       SUPABASE_DATABASE_URL=postgresql://...

--- 컷오버 저녁 (업무 한가할 때, 30~90분) ---
  1. npm run db:backup                               # (+ 가능하면 db:backup:dump)
  2. Supabase에 스키마만 푸시 (임시로 DATABASE_URL 교체):
       PowerShell: $env:DATABASE_URL=$env:SUPABASE_DATABASE_URL; npm run db:push
  3. npm run db:migrate-to-supabase                  # Neon → Supabase 데이터 복사
  4. node scripts/rewrite-env-to-supabase.mjs        # .env.local 전환 (Neon은 주석 보관)
  5. npm run vercel:sync-db                          # Vercel DATABASE_URL
  6. npm run vercel:deploy                           # 프로덕션 재배포
  7. 스모크: 로그인 / 수임처 검색 / 미수 공문 / 신고점검
  8. 행수 비교: npm run db:prep-supabase 결과 vs backups/pre-supabase-baseline-*.json

--- 주의 ---
  · 컷오버 당일 미수 스키마 대수술·대량 import 금지
  · Neon은 1~2주 유지 후 삭제
  · backups/ 는 gitignore — NAS/OneDrive에 복사 권장
`);
