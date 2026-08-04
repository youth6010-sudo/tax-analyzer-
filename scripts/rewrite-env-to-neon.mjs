/**
 * .env.local 의 DATABASE_URL을 Neon으로 교체 (Supabase는 주석 보관)
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

let neonUrl = process.env.NEON_DATABASE_URL || '';
if (!neonUrl) {
  for (const line of raw.split(/\n/)) {
    if (!/neon\.tech/i.test(line)) continue;
    const m = line.match(/DATABASE_URL=(.+)$/);
    if (m) {
      neonUrl = m[1].trim().replace(/^["']|["']$/g, '');
      break;
    }
  }
}
if (!neonUrl) {
  console.error('Neon URL not found');
  process.exit(1);
}

const lines = raw.split(/\r?\n/);
const out = [];
let wroteNeon = false;
for (const line of lines) {
  if (/^\s*DATABASE_URL=/.test(line)) {
    if (/supabase/i.test(line)) {
      out.push('# (이전) Supabase — Neon 전환 전 백업');
      out.push(`# ${line.replace(/^\s+/, '')}`);
    } else if (/neon\.tech/i.test(line)) {
      if (!wroteNeon) {
        out.push(`DATABASE_URL=${neonUrl}`);
        wroteNeon = true;
      }
    } else {
      out.push(`# ${line}`);
    }
    continue;
  }
  if (/^\s*#\s*DATABASE_URL=/.test(line) && /neon\.tech/i.test(line)) {
    if (!wroteNeon) {
      out.push(`DATABASE_URL=${neonUrl}`);
      wroteNeon = true;
    }
    continue;
  }
  out.push(line);
}
if (!wroteNeon) out.unshift(`DATABASE_URL=${neonUrl}`);

fs.writeFileSync(envPath, out.join('\n'), 'utf8');
console.log('✓ .env.local →', hostOf(neonUrl));
