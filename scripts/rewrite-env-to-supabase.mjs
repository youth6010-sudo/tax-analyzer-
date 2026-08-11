/**
 * .env.local 의 DATABASE_URL을 Supabase로 교체 (Neon은 주석 보관)
 *
 *   SUPABASE_DATABASE_URL=... node scripts/rewrite-env-to-supabase.mjs
 *   또는 .env.local 에 SUPABASE_DATABASE_URL= 이 있으면 그걸 사용
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');
const raw = fs.readFileSync(envPath, 'utf8');

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return 'invalid';
  }
}

function loadNamed(name) {
  for (const line of raw.split(/\n/)) {
    const m = line.match(new RegExp(`^\\s*${name}=(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

let supabaseUrl = process.env.SUPABASE_DATABASE_URL || loadNamed('SUPABASE_DATABASE_URL');
if (!supabaseUrl) {
  for (const line of raw.split(/\n/)) {
    if (!/supabase/i.test(line)) continue;
    const m = line.match(/DATABASE_URL=(.+)$/);
    if (m) {
      supabaseUrl = m[1].trim().replace(/^["']|["']$/g, '');
      break;
    }
  }
}
if (!supabaseUrl || !/supabase/i.test(hostOf(supabaseUrl))) {
  console.error('SUPABASE_DATABASE_URL not found (or host is not supabase)');
  process.exit(1);
}

const lines = raw.split(/\r?\n/);
const out = [];
let wroteActive = false;
for (const line of lines) {
  if (/^\s*DATABASE_URL=/.test(line)) {
    if (/neon\.tech/i.test(line)) {
      out.push('# (이전) Neon — Supabase 전환 전 롤백용');
      out.push(`# ${line.replace(/^\s+/, '')}`);
    } else if (/supabase/i.test(line)) {
      if (!wroteActive) {
        out.push(`DATABASE_URL=${supabaseUrl}`);
        wroteActive = true;
      }
    } else {
      out.push('# (이전) DATABASE_URL');
      out.push(`# ${line.replace(/^\s+/, '')}`);
    }
    continue;
  }
  if (/^\s*#\s*DATABASE_URL=/.test(line) && /supabase/i.test(line)) {
    if (!wroteActive) {
      out.push(`DATABASE_URL=${supabaseUrl}`);
      wroteActive = true;
    }
    continue;
  }
  out.push(line);
}
if (!wroteActive) out.unshift(`DATABASE_URL=${supabaseUrl}`);

fs.writeFileSync(envPath, out.join('\n'), 'utf8');
console.log('✓ .env.local →', hostOf(supabaseUrl));
console.log('  Neon URL은 주석으로 남겨 두었습니다. Vercel: npm run vercel:sync-db');
