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
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const [row] = await sql`SELECT value, updated_at FROM app_config WHERE key='bluehole_relay'`;
  if (!row) { console.log('아직 등록 안됨'); }
  else {
    console.log('등록 URL:', row.value.url);
    console.log('갱신시각:', row.updated_at);
    // 실제 도달 확인
    try {
      const r = await fetch(row.value.url, { method: 'GET', headers: { 'x-relay-secret': 'wrong' } });
      console.log('중계기 응답코드(잘못된 비밀):', r.status, r.status === 403 ? '→ 정상(보호됨)' : '');
    } catch (e) { console.log('중계기 도달 실패:', e.message); }
  }
} finally { await sql.end({ timeout: 5 }); }
