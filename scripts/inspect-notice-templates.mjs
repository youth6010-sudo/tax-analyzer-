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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  const rows = await sql`
    SELECT login_id, name, length(notice_template) AS tlen
    FROM users
    ORDER BY name
  `;
  console.log('총 사용자:', rows.length);
  for (const r of rows) {
    console.log(`- ${r.name} (${r.login_id}): 저장된 서식 길이 ${r.tlen}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
