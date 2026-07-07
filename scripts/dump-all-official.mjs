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
  const rows = await sql`SELECT login_id, name, notice_template FROM users WHERE notice_template <> ''`;
  for (const r of rows) {
    const raw = r.notice_template.trim();
    if (!raw.startsWith('{')) continue;
    const store = JSON.parse(raw);
    const letters = store.officialLetters;
    if (!letters) continue;
    for (const [k, html] of Object.entries(letters)) {
      if (typeof html === 'string' && html.trim()) {
        console.log(r.name, k, html.length);
        const out = path.join(root, 'app/tools/notice-generator/_lib/saved-defaults', `${k}-${r.login_id}.html`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, html);
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
