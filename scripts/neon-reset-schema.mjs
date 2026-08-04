/**
 * Neon public 스키마 초기화 후 drizzle push (비대화형)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const fileEnv = { ...loadEnv(path.join(root, '.env')), ...loadEnv(path.join(root, '.env.local')) };
const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || commentedNeonUrl(path.join(root, '.env.local'));
if (!neonUrl || !/neon\.tech/i.test(neonUrl)) {
  console.error('Neon URL required');
  process.exit(1);
}

console.log('Reset schema on', new URL(neonUrl).host);
const sql = postgres(neonUrl, { max: 1, prepare: false, connect_timeout: 20 });
try {
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO public');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  console.log('✓ public schema recreated');
} finally {
  await sql.end({ timeout: 3 });
}

console.log('drizzle-kit push --force…');
const push = spawnSync('npx', ['drizzle-kit', 'push', '--force'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: neonUrl },
  stdio: 'inherit',
  shell: true,
});
process.exit(push.status || 0);
