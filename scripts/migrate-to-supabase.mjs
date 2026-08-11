/**
 * Neon(현재 DATABASE_URL) → Supabase(DEST) 데이터 이전
 *
 * 사전:
 *   1. Supabase Seoul 프로젝트 + SUPABASE_DATABASE_URL (.env.local)
 *   2. DEST에 스키마 맞춤:
 *        set DATABASE_URL=%SUPABASE_DATABASE_URL% && npm run db:push
 *      (PowerShell: $env:DATABASE_URL=$env:SUPABASE_DATABASE_URL; npm run db:push)
 *
 * 실행:
 *   npm run db:migrate-to-supabase
 *
 * 환경변수:
 *   SOURCE = DATABASE_URL (보통 Neon)
 *   DEST   = SUPABASE_DATABASE_URL | DEST_DATABASE_URL
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) o[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}

function commentedUrl(p, hostRe) {
  if (!fs.existsSync(p)) return null;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    if (!hostRe.test(line)) continue;
    const m = line.match(/DATABASE_URL=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return 'invalid';
  }
}

const envPath = path.join(root, '.env.local');
const fileEnv = { ...loadEnvFile(path.join(root, '.env')), ...loadEnvFile(envPath) };
const sourceUrl = process.env.SOURCE_DATABASE_URL || fileEnv.DATABASE_URL;
const destUrl =
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DEST_DATABASE_URL ||
  process.env.TARGET_DATABASE_URL ||
  fileEnv.SUPABASE_DATABASE_URL ||
  fileEnv.DEST_DATABASE_URL ||
  fileEnv.TARGET_DATABASE_URL ||
  commentedUrl(envPath, /supabase/i);

if (!sourceUrl || !destUrl) {
  console.error('SOURCE(DATABASE_URL) / DEST(SUPABASE_DATABASE_URL) required');
  process.exit(1);
}
if (hostOf(sourceUrl) === hostOf(destUrl)) {
  console.error('SOURCE and DEST are the same host — abort');
  process.exit(1);
}
if (!/supabase/i.test(hostOf(destUrl))) {
  console.error('DEST host does not look like Supabase:', hostOf(destUrl));
  process.exit(1);
}

console.log('SOURCE', hostOf(sourceUrl));
console.log('DEST  ', hostOf(destUrl));

const src = postgres(sourceUrl, { max: 1, prepare: false, connect_timeout: 20 });
const dst = postgres(destUrl, { max: 1, prepare: false, connect_timeout: 20 });

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

try {
  const srcTables = await src`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const dstTables = await dst`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const dstSet = new Set(dstTables.map(r => r.table_name));
  const names = srcTables.map(r => r.table_name).filter(n => dstSet.has(n));
  const missingOnDest = srcTables.map(r => r.table_name).filter(n => !dstSet.has(n));
  if (missingOnDest.length) {
    console.warn('DEST에 없는 테이블(건너뜀):', missingOnDest.join(', '));
    console.warn('→ 먼저 DEST에 npm run db:push 하세요.');
  }
  if (!names.length) {
    console.error('복사할 공통 테이블이 없습니다. DEST 스키마를 먼저 푸시하세요.');
    process.exit(1);
  }
  console.log(`복사 대상 ${names.length}개 테이블`);

  const fks = await dst`
    SELECT c.conname,
           c.conrelid::regclass::text AS table_name,
           pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
  `;
  console.log(`FK ${fks.length}개 임시 제거…`);
  for (const fk of fks) {
    await dst.unsafe(`ALTER TABLE ${fk.table_name} DROP CONSTRAINT ${qIdent(fk.conname)}`);
  }

  for (const name of names) {
    const rows = await src.unsafe(`SELECT * FROM ${qIdent(name)}`);
    await dst.unsafe(`TRUNCATE TABLE ${qIdent(name)} CASCADE`);
    if (!rows.length) {
      console.log(`  ${name}: 0`);
      continue;
    }
    const cols = Object.keys(rows[0]);
    const chunk = 100;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      await dst`INSERT INTO ${dst(name)} ${dst(slice, cols)}`;
    }
    console.log(`  ${name}: ${rows.length}`);
  }

  console.log('FK 복원…');
  for (const fk of fks) {
    try {
      await dst.unsafe(
        `ALTER TABLE ${fk.table_name} ADD CONSTRAINT ${qIdent(fk.conname)} ${fk.def}`,
      );
    } catch (e) {
      console.warn(`  FK ${fk.conname} skip:`, String(e.message).slice(0, 100));
    }
  }

  const seqs = await src`
    SELECT c.relname AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname = 'public'
  `;
  for (const { seq } of seqs) {
    try {
      const [{ last }] = await src.unsafe(`SELECT last_value AS last FROM ${qIdent(seq)}`);
      const safe = String(seq).replace(/'/g, "''");
      await dst.unsafe(`SELECT setval('${safe}', ${Number(last)}, true)`);
      console.log(`  seq ${seq} → ${last}`);
    } catch (e) {
      console.warn(`  seq ${seq} skip:`, String(e.message).slice(0, 80));
    }
  }

  console.log('행수 검증…');
  let mismatch = 0;
  for (const name of names) {
    const [{ a }] = await src.unsafe(`SELECT count(*)::int AS a FROM ${qIdent(name)}`);
    const [{ b }] = await dst.unsafe(`SELECT count(*)::int AS b FROM ${qIdent(name)}`);
    if (a !== b) {
      console.warn(`  ≠ ${name}: src ${a} / dst ${b}`);
      mismatch += 1;
    }
  }
  if (mismatch) {
    console.warn(`행수 불일치 ${mismatch}개 — 로그 확인`);
  } else {
    console.log(`✓ 행수 일치 (${names.length} tables)`);
  }
  console.log('✓ migrate-to-supabase done');
} catch (e) {
  console.error('migrate failed:', e);
  process.exit(1);
} finally {
  await src.end({ timeout: 3 });
  await dst.end({ timeout: 3 });
}
