import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.log('NO_DB');
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const counts = await sql`
  select
    count(*)::int as total,
    count(*) filter (
      where jsonb_typeof(data->'excluded') = 'object'
        and data->'excluded' <> '{}'::jsonb
    )::int as with_excluded
  from filing_check_sessions
`;
console.log('counts', counts[0]);

const sample = await sql`
  select manager, tax_type, period_key, data->'excluded' as excluded, updated_at
  from filing_check_sessions
  where jsonb_typeof(data->'excluded') = 'object'
    and data->'excluded' <> '{}'::jsonb
  order by updated_at desc
  limit 5
`;
console.log('sample', JSON.stringify(sample, null, 2));
await sql.end();
