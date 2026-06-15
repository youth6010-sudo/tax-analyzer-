import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
const vars = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim();
}

const scope = 'tax-analyzer-s-projects';
const vercel = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const names = ['SESSION_SECRET', 'DATABASE_URL'];

for (const name of names) {
  const value = vars[name];
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  for (const target of ['production', 'preview', 'development']) {
    const result = spawnSync(
      vercel,
      ['vercel@latest', 'env', 'add', name, target, '--scope', scope, '--value', value, '--yes', '--force'],
      { stdio: 'inherit', shell: true },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log(`OK ${name} ${target}`);
  }
}
