import { readFileSync } from 'fs';
import postgres from 'postgres';

const env = readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = postgres(m[1].trim().replace(/^["']|["']$/g, ''), { max: 1, prepare: false });

const [{ max_as_of }] = await sql`SELECT max(as_of_date) AS max_as_of FROM arrears_entries`;
const letterDate = String(max_as_of || '').replace(/-/g, '.');
console.log('sync to', max_as_of, letterDate);

const updated = await sql`
  UPDATE arrears_entries SET
    as_of_date = ${max_as_of},
    letter_date = ${letterDate},
    updated_by = 'sync-inactive-asof',
    updated_at = now()
  WHERE external_code IN ('00183', '00199')
  RETURNING company_name, as_of_date, letter_date
`;
console.log(updated);

await sql.end({ timeout: 5 });
