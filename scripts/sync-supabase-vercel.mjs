/**
 * Sync .env.local DATABASE_URL (must be Supabase) → Vercel project envs.
 * Requires: npx vercel login (youth6010 / tax-analyzer-s-projects) + .vercel/project.json
 *
 *   npm run vercel:sync-db
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const vars = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const databaseUrl = vars.DATABASE_URL;
if (!databaseUrl || !/supabase/i.test(databaseUrl)) {
  console.error('DATABASE_URL must be Supabase');
  process.exit(1);
}

const project = JSON.parse(
  fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'),
);
const teamId = project.orgId;
const projectId = project.projectId;

const authPath = path.join(
  process.env.APPDATA || '',
  'xdg.data',
  'com.vercel.cli',
  'auth.json',
);
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const token = process.env.VERCEL_TOKEN || auth.token;
if (!token) {
  console.error('No Vercel token. Set VERCEL_TOKEN or run: npx vercel login');
  process.exit(1);
}

async function api(method, urlPath, body) {
  const url = new URL(`https://api.vercel.com${urlPath}`);
  url.searchParams.set('teamId', teamId);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

console.log('Sync Supabase DATABASE_URL →', new URL(databaseUrl).hostname);

try {
  const existing = await api('GET', `/v9/projects/${projectId}/env`);
  const envs = existing.envs || [];
  const targets = ['production', 'preview', 'development'];
  const matches = envs.filter((e) => e.key === 'DATABASE_URL');

  for (const row of matches) {
    await api('DELETE', `/v9/projects/${projectId}/env/${row.id}`);
  }

  await api('POST', `/v10/projects/${projectId}/env`, {
    key: 'DATABASE_URL',
    value: databaseUrl,
    type: 'encrypted',
    target: targets,
  });
  console.log('OK DATABASE_URL →', targets.join(','));
  console.log('Redeploy production for runtime to pick up changes.');
} catch (e) {
  console.error('Failed:', e.message, JSON.stringify(e.body || {}).slice(0, 300));
  process.exit(1);
}
