/**
 * 1) Neon에 스키마 push
 * 2) Supabase → Neon 데이터 복사
 * 3) .env.local DATABASE_URL을 Neon으로 교체 (Supabase URL은 주석 보관)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

function commentedNeonUrl(text) {
  for (const line of text.split(/\n/)) {
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

const raw = fs.readFileSync(envPath, 'utf8');
const neonUrl = process.env.NEON_DATABASE_URL || commentedNeonUrl(raw);
if (!neonUrl || !/neon\.tech/i.test(neonUrl)) {
  console.error('Neon DATABASE_URL을 .env.local 주석 또는 NEON_DATABASE_URL로 지정하세요.');
  process.exit(1);
}

console.log('Neon host:', hostOf(neonUrl));
console.log('1/3 reset schema + drizzle push → Neon…');
const push = spawnSync(process.execPath, [path.join(root, 'scripts/neon-reset-schema.mjs')], {
  cwd: root,
  env: { ...process.env, NEON_DATABASE_URL: neonUrl, DATABASE_URL: neonUrl },
  stdio: 'inherit',
  shell: false,
});
if (push.status !== 0) process.exit(push.status || 1);

console.log('2/3 data migrate…');
const mig = spawnSync(process.execPath, [path.join(root, 'scripts/migrate-to-neon.mjs')], {
  cwd: root,
  env: { ...process.env, NEON_DATABASE_URL: neonUrl },
  stdio: 'inherit',
  shell: false,
});
if (mig.status !== 0) process.exit(mig.status || 1);

console.log('3/3 rewrite .env.local DATABASE_URL → Neon…');
const lines = raw.split(/\r?\n/);
const out = [];
let sawActive = false;
for (const line of lines) {
  if (/^\s*DATABASE_URL=/.test(line) && /supabase/i.test(line)) {
    out.push(`# (이전) Supabase — Neon 전환 전`);
    out.push(`# ${line}`);
    if (!sawActive) {
      out.push(`DATABASE_URL=${neonUrl}`);
      sawActive = true;
    }
    continue;
  }
  if (/^\s*DATABASE_URL=/.test(line) && /neon\.tech/i.test(line)) {
    // already active neon — keep once
    if (!sawActive) {
      out.push(`DATABASE_URL=${neonUrl}`);
      sawActive = true;
    }
    continue;
  }
  // skip duplicate commented neon that we're promoting
  if (/^\s*#\s*DATABASE_URL=/.test(line) && /neon\.tech/i.test(line) && sawActive) {
    continue;
  }
  out.push(line);
}
if (!sawActive) {
  out.unshift(`DATABASE_URL=${neonUrl}`);
}
fs.writeFileSync(envPath, out.join('\n'), 'utf8');
console.log('✓ .env.local updated →', hostOf(neonUrl));
console.log('다음: Vercel DATABASE_URL을 Neon으로 바꾼 뒤 재배포하세요.');
