/**
 * LIVE(Supabase DATABASE_URL) → Neon(PREV_DATABASE_URL)
 * 미수 엔트리·공문 줄만 복사해 08.31 확정본 백업으로 고정.
 *
 * node scripts/sync-live-arrears-to-neon.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) o[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}

const env = { ...loadEnv(path.join(root, '.env')), ...loadEnv(path.join(root, '.env.local')) };
const liveUrl = process.env.DATABASE_URL || env.DATABASE_URL;
const neonUrl = process.env.PREV_DATABASE_URL || env.PREV_DATABASE_URL || env.NEON_DATABASE_URL;

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return 'invalid';
  }
}

if (!liveUrl || !neonUrl) {
  console.error('DATABASE_URL + PREV_DATABASE_URL required');
  process.exit(1);
}
if (hostOf(liveUrl) === hostOf(neonUrl)) {
  console.error('LIVE and Neon are the same host — abort');
  process.exit(1);
}

console.log('LIVE', hostOf(liveUrl));
console.log('NEON', hostOf(neonUrl));
console.log(APPLY ? 'APPLY' : 'DRY-RUN');

const live = postgres(liveUrl, { max: 1, prepare: false, connect_timeout: 25 });
const neon = postgres(neonUrl, { max: 1, prepare: false, connect_timeout: 60 });

await neon`SET statement_timeout = '120s'`;

const neonEntryCols = (
  await neon`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'arrears_entries'
    ORDER BY ordinal_position`
).map(r => r.column_name);

const entries = await live`SELECT * FROM arrears_entries ORDER BY external_code`;
const lines = await live`SELECT * FROM arrears_letter_lines ORDER BY arrears_entry_id, sort_order, id`;
console.log('LIVE entries', entries.length, 'lines', lines.length);

const beforeE = await neon`SELECT count(*)::int AS n FROM arrears_entries`;
const beforeL = await neon`SELECT count(*)::int AS n FROM arrears_letter_lines`;
console.log('NEON before', beforeE[0].n, beforeL[0].n);

const skippedEntryCols = Object.keys(entries[0] || {}).filter(k => !neonEntryCols.includes(k));
if (skippedEntryCols.length) console.log('skip entry cols:', skippedEntryCols.join(','));

if (!APPLY) {
  console.log('Re-run with --apply');
  await live.end({ timeout: 5 });
  await neon.end({ timeout: 5 });
  process.exit(0);
}

const entryCols = neonEntryCols.filter(
  c => c === 'client_id' || Object.prototype.hasOwnProperty.call(entries[0] || {}, c),
);
const lineCols = [
  'id',
  'arrears_entry_id',
  'sort_order',
  'description',
  'amount',
  'paid_amount',
  'paid_date',
  'source',
  'created_at',
  'updated_at',
];

console.log('TRUNCATE...');
await neon`TRUNCATE arrears_letter_lines, arrears_entries RESTART IDENTITY CASCADE`;
console.log('truncated ok');

const entryColSql = entryCols.map(c => `"${c}"`).join(',');
const lineColSql = lineCols.map(c => `"${c}"`).join(',');

let n = 0;
for (const e of entries) {
  const vals = entryCols.map(c => (c === 'client_id' ? null : e[c]));
  const ph = entryCols.map((_, i) => `$${i + 1}`).join(',');
  await neon.unsafe(
    `INSERT INTO arrears_entries (${entryColSql}) VALUES (${ph})`,
    vals,
  );
  n += 1;
  if (n % 50 === 0) console.log('entries', n);
}
console.log('entries done', n);

n = 0;
for (const l of lines) {
  const vals = lineCols.map(c => l[c]);
  const ph = lineCols.map((_, i) => `$${i + 1}`).join(',');
  await neon.unsafe(
    `INSERT INTO arrears_letter_lines (${lineColSql}) VALUES (${ph})`,
    vals,
  );
  n += 1;
  if (n % 200 === 0) console.log('lines', n);
}
console.log('lines done', n);

const afterE = await neon`SELECT count(*)::int AS n FROM arrears_entries`;
const afterL = await neon`SELECT count(*)::int AS n FROM arrears_letter_lines`;
console.log('NEON after entries', afterE[0].n, 'lines', afterL[0].n);
console.log('DONE — Neon is frozen snapshot of LIVE.');

fs.writeFileSync(
  path.join(root, 'data/_neon-arrears-freeze-meta.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      liveHost: hostOf(liveUrl),
      neonHost: hostOf(neonUrl),
      entries: afterE[0].n,
      lines: afterL[0].n,
      skippedEntryCols,
      note: '08.31 cutoff freeze backup. LIVE remains source of truth. client_id nulled on Neon.',
    },
    null,
    2,
  ),
);

await live.end({ timeout: 5 });
await neon.end({ timeout: 5 });
