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
  SELECT data, updated_at
  FROM filing_check_sessions
  WHERE manager = '리아' AND tax_type = 'withholding' AND period_key = '2026-06'
  LIMIT 1
`;
const data = rows[0]?.data ?? {};
const keys = Object.keys(data);
console.log('updated_at', rows[0]?.updated_at);
console.log('top keys', keys);
console.log('excluded count', Object.keys(data.excluded || {}).length);
console.log('rowNotes count', Object.keys(data.rowNotes || {}).length);
console.log('excelBizNos', (data.excelBizNos || []).length);
console.log('forceIncluded', Object.keys(data.forceIncluded || {}).length);
console.log('extraClients', (data.extraClients || []).length);
console.log('overrides', Object.keys(data.overrides || {}).length);
console.log('fileName', data.fileName || '');
console.log('done', data.done);
console.log('diffReason', data.diffReason || '');
console.log('sample excluded', Object.entries(data.excluded || {}).slice(0, 5));
await sql.end({ timeout: 5 });
