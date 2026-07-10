import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const rows = await sql`
  SELECT manager, tax_type, period_key, updated_at,
    COALESCE(jsonb_array_length(data->'excelBizNos'), 0) AS excel_n,
    COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'excluded', '{}'::jsonb))), 0) AS excluded_n,
    COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'rowNotes', '{}'::jsonb))), 0) AS notes_n,
    COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'forceIncluded', '{}'::jsonb))), 0) AS force_n,
    COALESCE(jsonb_array_length(data->'extraClients'), 0) AS extra_n,
    left(data::text, 200) AS data_head
  FROM filing_check_sessions
  WHERE manager = '리아' AND tax_type = 'withholding'
  ORDER BY period_key DESC
  LIMIT 10
`;

console.log(JSON.stringify(rows, null, 2));

const recent = await sql`
  SELECT manager, tax_type, period_key, updated_at,
    COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'excluded', '{}'::jsonb))), 0) AS excluded_n,
    COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'rowNotes', '{}'::jsonb))), 0) AS notes_n
  FROM filing_check_sessions
  WHERE tax_type = 'withholding'
  ORDER BY updated_at DESC
  LIMIT 15
`;
console.log('--- recent updates ---');
console.log(JSON.stringify(recent, null, 2));

await sql.end({ timeout: 5 });
