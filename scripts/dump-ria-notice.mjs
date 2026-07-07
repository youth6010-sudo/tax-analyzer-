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
try {
  const [r] = await sql`SELECT notice_template FROM users WHERE login_id = 'ria'`;
  const store = JSON.parse(r.notice_template);
  console.log('version', store.version);
  console.log('keys', Object.keys(store));
  if (store.officialLetters) console.log('official keys', Object.keys(store.officialLetters));
  for (const [k, v] of Object.entries(store.officialLetters ?? {})) {
    if (typeof v === 'string') {
      const out = path.join(root, `app/tools/notice-generator/_lib/saved-defaults/${k}-ria.html`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, v);
      console.log(k, v.length, '->', out);
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
