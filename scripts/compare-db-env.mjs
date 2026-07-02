import fs from 'node:fs';

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function describeDbUrl(url) {
  if (!url) return { host: '(missing)', db: '', port: '', isSupabase: false, isNeon: false };
  try {
    const u = new URL(url);
    const host = u.hostname;
    return {
      host,
      db: u.pathname.replace(/^\//, ''),
      port: u.port || '5432',
      isSupabase: /supabase/i.test(host),
      isNeon: /neon/i.test(host),
    };
  } catch {
    return { host: '(invalid)', db: '', port: '', isSupabase: false, isNeon: false };
  }
}

const local = parseEnvFile('.env.local');
const vercel = parseEnvFile('.env.vercel.production');

const localDb = describeDbUrl(local.DATABASE_URL);
const vercelDb = describeDbUrl(vercel.DATABASE_URL);

console.log('=== Local (.env.local) ===');
console.log(JSON.stringify(localDb, null, 2));
console.log('=== Vercel (.env.vercel.production) ===');
console.log(JSON.stringify(vercelDb, null, 2));
console.log('=== Match ===');
console.log(
  localDb.host === vercelDb.host && localDb.db === vercelDb.db
    ? 'SAME_DATABASE'
    : 'DIFFERENT_DATABASE',
);
