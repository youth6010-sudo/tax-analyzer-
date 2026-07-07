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

const outDir = path.join(root, 'app/tools/notice-generator/_lib/saved-defaults');
fs.mkdirSync(outDir, { recursive: true });

const sql = postgres(url, { max: 1, prepare: false });
try {
  const rows = await sql`
    SELECT login_id, name, notice_template
    FROM users
    WHERE notice_template <> ''
  `;
  for (const r of rows) {
    try {
      const store = JSON.parse(r.notice_template);
      const letters = store.officialLetters ?? {};
      for (const k of ['income', 'vat', 'corporate']) {
        const html = letters[k];
        if (typeof html === 'string' && html.trim()) {
          const file = path.join(outDir, `${k}-${r.login_id}.html`);
          fs.writeFileSync(file, html);
          console.log('wrote', file, html.length);
        }
      }
    } catch {
      /* skip */
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
