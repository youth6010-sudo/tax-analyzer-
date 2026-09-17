/**
 * 연결 수임처 담당 → 미수 담당 일괄 맞춤
 * node scripts/sync-arrears-managers-from-clients.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const before = await sql`
  SELECT count(*)::int AS n
  FROM arrears_entries ae
  JOIN clients cl ON ae.client_id = cl.id
  WHERE coalesce(ae.manager_name,'') IS DISTINCT FROM coalesce(cl.manager,'')
`;
console.log('mismatches before', before[0].n);

const updated = await sql`
  UPDATE arrears_entries AS ae
  SET manager_name = cl.manager, updated_at = now()
  FROM clients AS cl
  WHERE ae.client_id = cl.id
    AND coalesce(ae.manager_name,'') IS DISTINCT FROM coalesce(cl.manager,'')
  RETURNING ae.company_name, ae.manager_name
`;
console.log('updated', updated.length);
console.log(updated.slice(0, 12));

const after = await sql`
  SELECT count(*)::int AS n
  FROM arrears_entries ae
  JOIN clients cl ON ae.client_id = cl.id
  WHERE coalesce(ae.manager_name,'') IS DISTINCT FROM coalesce(cl.manager,'')
`;
console.log('mismatches after', after[0].n);

await sql.end();
