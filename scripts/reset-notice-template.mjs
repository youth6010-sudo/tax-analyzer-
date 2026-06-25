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

// 인자로 받은 login_id들의 저장 서식을 비워 기본 서식을 다시 쓰게 함. 기본값: charlie
const targets = process.argv.slice(2);
const loginIds = targets.length ? targets : ['charlie'];

const sql = postgres(url, { max: 1, prepare: false });

try {
  const updated = await sql`
    UPDATE users
    SET notice_template = ''
    WHERE login_id IN ${sql(loginIds)}
    RETURNING login_id, name
  `;
  if (!updated.length) {
    console.log('초기화 대상 없음:', loginIds.join(', '));
  } else {
    for (const r of updated) {
      console.log(`초기화 완료: ${r.name} (${r.login_id}) → 기본 서식 사용`);
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
