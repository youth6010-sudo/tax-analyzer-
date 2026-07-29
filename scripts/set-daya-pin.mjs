/**
 * 다야 PIN을 0000으로 설정
 * node scripts/set-daya-pin.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });
const pinHash = await bcrypt.hash('0000', 10);
const rows = await sql`
  UPDATE users
  SET pin_hash = ${pinHash}
  WHERE login_id = 'daya' OR name = '다야'
  RETURNING login_id, name
`;
console.log('Updated:', rows);
await sql.end();
