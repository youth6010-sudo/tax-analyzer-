/**
 * .env.local DATABASE_URL → Vercel (Neon/Supabase)
 * Windows에서 URL의 & 가 깨지지 않도록 value는 파일로 전달합니다.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
const vars = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const scope = 'tax-analyzer-s-projects';
const vercelBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
let databaseUrl = vars.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

// shell/vercel 파싱 이슈 방지: channel_binding 제거 (sslmode=require 유지)
try {
  const u = new URL(databaseUrl);
  u.searchParams.delete('channel_binding');
  databaseUrl = u.toString();
} catch {
  /* keep raw */
}

let host = databaseUrl;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  /* ignore */
}
console.log('Sync DATABASE_URL → Vercel:', host);

const tmp = path.join(os.tmpdir(), `vercel-database-url-${Date.now()}.txt`);
fs.writeFileSync(tmp, databaseUrl, 'utf8');

function runVercel(args) {
  return spawnSync(vercelBin, ['vercel@latest', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    input: undefined,
  });
}

try {
  for (const target of ['production', 'preview', 'development']) {
    console.log(`rm DATABASE_URL (${target})…`);
    spawnSync(
      vercelBin,
      ['vercel@latest', 'env', 'rm', 'DATABASE_URL', target, '--scope', scope, '--yes'],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );

    console.log(`add DATABASE_URL (${target})…`);
    // stdin으로 값 전달
    const add = spawnSync(
      vercelBin,
      ['vercel@latest', 'env', 'add', 'DATABASE_URL', target, '--scope', scope, '--yes', '--force'],
      {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
        input: databaseUrl + '\n',
      },
    );
    if (add.status !== 0) {
      // fallback: --value with quoted URL without &
      const add2 = spawnSync(
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
        { stdio: 'inherit', shell: false },
      );
      if (add2.status !== 0) {
        console.error(`Failed: DATABASE_URL ${target}`);
        process.exit(add2.status ?? 1);
      }
    }
    console.log(`OK DATABASE_URL ${target}`);
  }
} finally {
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}

console.log('Done. Redeploy production for runtime to pick up changes.');
