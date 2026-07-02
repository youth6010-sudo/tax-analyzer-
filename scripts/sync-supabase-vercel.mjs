import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
const vars = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const scope = 'tax-analyzer-s-projects';
const vercelBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const databaseUrl = vars.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

let host = databaseUrl;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  /* ignore */
}
if (!/supabase/i.test(host)) {
  console.error('DATABASE_URL is not Supabase:', host);
  process.exit(1);
}
console.log('Sync Supabase DATABASE_URL →', host);

for (const target of ['production', 'preview', 'development']) {
  const result = spawnSync(
    vercelBin,
    [
      'vercel@latest',
      'env',
      'add',
      'DATABASE_URL',
      target,
      '--scope',
      scope,
      '--value',
      databaseUrl,
      '--yes',
      '--force',
      '--non-interactive',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    console.error(`Failed: DATABASE_URL ${target}`);
    process.exit(result.status ?? 1);
  }
  console.log(`OK DATABASE_URL ${target}`);
}

console.log('Done. Redeploy production for runtime to pick up changes.');
