/**
 * 직원 계정 seed — node scripts/seed-users.mjs [users.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
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
}

loadEnv();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const inputPath = process.argv[2] || path.join(root, 'data', 'seed-users.json');
let seedList = [{ loginId: 'admin', name: '관리자', pin: '1234', role: 'admin' }];

if (fs.existsSync(inputPath)) {
  seedList = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

const sql = postgres(dbUrl, { max: 1 });

for (const u of seedList) {
  const loginId = u.loginId.trim().toLowerCase();
  const pinHash = await bcrypt.hash(String(u.pin), 10);
  const role = u.role === 'admin' ? 'admin' : 'staff';
  const realName = u.realName?.trim() ?? u.name;

  const existing = await sql`SELECT id FROM users WHERE login_id = ${loginId} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE users SET name = ${u.name}, real_name = ${realName}, pin_hash = ${pinHash}, role = ${role}
      WHERE login_id = ${loginId}
    `;
    console.log('Updated', loginId);
  } else {
    await sql`
      INSERT INTO users (login_id, name, real_name, pin_hash, role)
      VALUES (${loginId}, ${u.name}, ${realName}, ${pinHash}, ${role})
    `;
    console.log('Created', loginId);
  }
}

await sql.end();
console.log('Done.');
