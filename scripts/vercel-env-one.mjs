import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const name = process.argv[2];
const target = process.argv[3] ?? 'production';
if (!name) {
  console.error('Usage: node scripts/vercel-env-one.mjs NAME [production]');
  process.exit(1);
}

const vars = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const value = vars[name];
if (!value) {
  console.error(`Missing ${name}`);
  process.exit(1);
}

// Remove broken empty value first (ignore errors)
spawnSync(
  'npx',
  ['vercel@latest', 'env', 'rm', name, target, '--scope', 'tax-analyzer-s-projects', '--yes'],
  { stdio: 'inherit', shell: true },
);

const r = spawnSync(
  'npx',
  ['vercel@latest', 'env', 'add', name, target, '--scope', 'tax-analyzer-s-projects', '--yes', '--force'],
  { input: value, stdio: ['pipe', 'inherit', 'inherit'], shell: true },
);
process.exit(r.status ?? 1);
