/**
 * TARGET/SUPABASE URL로 drizzle-kit push (컷오버용, 임시)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');
const raw = fs.readFileSync(envPath, 'utf8');
const env = { ...process.env };
for (const line of raw.split(/\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m && !env[m[1].trim()]) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const dest =
  env.TARGET_DATABASE_URL || env.SUPABASE_DATABASE_URL || env.DEST_DATABASE_URL;
if (!dest || !/supabase/i.test(dest)) {
  console.error('Supabase DEST URL required (TARGET_DATABASE_URL)');
  process.exit(1);
}

env.DATABASE_URL = dest;
console.log('db:push →', new URL(dest).host, 'port', new URL(dest).port || '5432');
const r = spawnSync('npx', ['drizzle-kit', 'push'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
