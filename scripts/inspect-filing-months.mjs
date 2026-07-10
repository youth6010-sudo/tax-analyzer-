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
for (const pk of ['2026-05', '2026-06', '2026-07']) {
  const rows = await sql`
    SELECT
      COALESCE(jsonb_array_length(data->'excelBizNos'), 0) AS excel_n,
      COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'excluded', '{}'::jsonb))), 0) AS excluded_n,
      COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'rowNotes', '{}'::jsonb))), 0) AS notes_n,
      COALESCE((SELECT count(*)::int FROM jsonb_object_keys(COALESCE(data->'overrides', '{}'::jsonb))), 0) AS overrides_n,
      data->>'fileName' AS file_name,
      data->>'diffReason' AS diff_reason,
      updated_at
    FROM filing_check_sessions
    WHERE manager = '리아' AND tax_type = 'withholding' AND period_key = ${pk}
    LIMIT 1
  `;
  console.log(pk, rows[0] || null);
}
await sql.end({ timeout: 5 });
