import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const envFile = process.argv[2] ?? '.env.local';
if (!fs.existsSync(envFile)) {
  console.error(`Missing ${envFile}`);
  process.exit(1);
}

const env = { ...process.env };
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

if (!env.DATABASE_URL || env.DATABASE_URL.length < 20) {
  console.error('DATABASE_URL missing or invalid in', envFile);
  process.exit(1);
}

console.log('Using DATABASE_URL from', envFile, `(length ${env.DATABASE_URL.length})`);

for (const cmd of ['db:push', 'db:seed']) {
  console.log(`\n> npm run ${cmd}`);
  const r = spawnSync('npm', ['run', cmd], { env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('\nDB schema + users seeded.');
