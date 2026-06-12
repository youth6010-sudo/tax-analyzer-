/**
 * 세목 초기화 + 휴대번호 분리 마이그레이션
 * node scripts/migrate-client-phones-tax.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const sql = postgres(dbUrl, { max: 1 });

const taxReset = await sql`UPDATE clients SET tax_types = '[]'::jsonb WHERE tax_types IS DISTINCT FROM '[]'::jsonb`;
console.log(`세목 초기화: ${taxReset.count}건`);

const mobileMoved = await sql`
  UPDATE clients
  SET
    intake_data = jsonb_set(COALESCE(intake_data, '{}'::jsonb), '{mobilePhone}', to_jsonb(phone), true),
    phone = ''
  WHERE phone ~ '^01[0-9]'
    AND (intake_data->>'mobilePhone' IS NULL OR intake_data->>'mobilePhone' = '')
`;
console.log(`휴대번호 분리: ${mobileMoved.count}건`);

await sql.end();
console.log('완료');
