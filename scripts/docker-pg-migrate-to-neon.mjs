/**
 * Docker postgres 이미지의 pg_dump / pg_restore로 Supabase → Neon 이전
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dumpPath = path.join(root, '.cache', 'supabase-to-neon.dump');

function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) o[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}

function commentedNeonUrl(p) {
  if (!fs.existsSync(p)) return null;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    if (!/neon\.tech/i.test(line)) continue;
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

/** pooler → 직접 엔드포인트 (dump/restore용) */
function preferDirectUrl(u) {
  try {
    const url = new URL(u);
    if (url.port === '6543') url.port = '5432';
    url.hostname = url.hostname.replace('-pooler.', '.');
    return url.toString();
  } catch {
    return u;
  }
}

const fileEnv = { ...loadEnv(path.join(root, '.env')), ...loadEnv(path.join(root, '.env.local')) };
const sourceUrl = preferDirectUrl(
  process.env.SOURCE_DATABASE_URL || fileEnv.TARGET_DATABASE_URL || fileEnv.DATABASE_URL,
);
const destUrl = preferDirectUrl(
  process.env.NEON_DATABASE_URL || fileEnv.NEON_DATABASE_URL || commentedNeonUrl(path.join(root, '.env.local')),
);

if (!sourceUrl || !destUrl) {
  console.error('SOURCE/DEST required');
  process.exit(1);
}

console.log('SOURCE', hostOf(sourceUrl));
console.log('DEST  ', hostOf(destUrl));

fs.mkdirSync(path.dirname(dumpPath), { recursive: true });
const dumpDir = path.dirname(dumpPath).replace(/\\/g, '/');
const dumpFile = path.basename(dumpPath);

// Windows Docker: mount drive
const mount = `${path.dirname(dumpPath)}:/dump`;

console.log('1) pg_dump…');
const dump = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${path.dirname(dumpPath)}:/dump`,
    'postgres:16',
    'pg_dump',
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--dbname',
    sourceUrl,
    '--file',
    `/dump/${dumpFile}`,
  ],
  { encoding: 'utf8', shell: false },
);
if (dump.status !== 0) {
  console.error(dump.stderr || dump.stdout);
  process.exit(dump.status || 1);
}
console.log('✓ dump', (fs.statSync(dumpPath).size / 1024 / 1024).toFixed(2), 'MB');

console.log('2) reset DEST schema…');
const dst = postgres(destUrl, { max: 1, prepare: false, connect_timeout: 20 });
try {
  await dst.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await dst.unsafe('CREATE SCHEMA public');
  await dst.unsafe('GRANT ALL ON SCHEMA public TO public');
  await dst.unsafe('GRANT ALL ON SCHEMA public TO CURRENT_USER');
} finally {
  await dst.end({ timeout: 3 });
}

console.log('3) pg_restore…');
const restore = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${path.dirname(dumpPath)}:/dump`,
    'postgres:16',
    'pg_restore',
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
    '--dbname',
    destUrl,
    `/dump/${dumpFile}`,
  ],
  { encoding: 'utf8', shell: false },
);
// pg_restore returns 1 on warnings sometimes
const errText = restore.stderr || '';
if (restore.status && restore.status > 1) {
  console.error(errText || restore.stdout);
  process.exit(restore.status);
}
if (errText && /ERROR/i.test(errText)) {
  console.warn(errText.slice(0, 2000));
} else if (errText) {
  console.log('(pg_restore notices)', errText.slice(0, 500));
}

const check = postgres(destUrl, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const [{ tables }] = await check`
    SELECT count(*)::int AS tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const [{ clients }] = await check`SELECT count(*)::int AS clients FROM clients`.catch(() => [{ clients: -1 }]);
  console.log('✓ restore done', { tables, clients });
} finally {
  await check.end({ timeout: 3 });
}
