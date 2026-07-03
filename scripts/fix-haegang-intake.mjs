/**
 * 주식회사 해강 ↔ 인화칼국수 재송점 혼선 복구 (1회성)
 * node scripts/fix-haegang-intake.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const CLIENT_HAEGANG = '5f19b97d-c3dc-43c7-bb6e-cab23b54fb71';
const CLIENT_INHWA = '093d118d-dc6c-48c5-ae57-46004fbc1c73';
const INQUIRY_HAEGANG = '9356c30b-72b3-4aec-88cf-9360b9b35e68';
const PROCESS_HAEGANG = '02203926-5e4b-4176-a772-eab84149a59a';
const PROCESS_INHWA = '7c667928-e558-4580-9137-035463ed498b';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const [client] = await sql`
  UPDATE clients
  SET company_name = '주식회사 해강',
      intake_data = jsonb_set(
        jsonb_set(intake_data, '{processId}', ${JSON.stringify(PROCESS_HAEGANG)}::jsonb),
        '{inquiryId}', ${JSON.stringify(INQUIRY_HAEGANG)}::jsonb
      ),
      updated_at = now()
  WHERE id = ${CLIENT_HAEGANG}
  RETURNING id, company_name
`;
console.log('client', client);

const [inq] = await sql`
  UPDATE intake_inquiries
  SET company_name = '주식회사 해강'
  WHERE id = ${INQUIRY_HAEGANG}
  RETURNING id, company_name
`;
console.log('inquiry', inq);

const [procHaegang] = await sql`
  UPDATE intake_processes
  SET client_id = ${CLIENT_HAEGANG}
  WHERE id = ${PROCESS_HAEGANG}
  RETURNING id, company_name, client_id
`;
console.log('process haegang', procHaegang);

const [procInhwa] = await sql`
  UPDATE intake_processes
  SET client_id = ${CLIENT_INHWA}
  WHERE id = ${PROCESS_INHWA}
  RETURNING id, company_name, client_id
`;
console.log('process inhwa (restored)', procInhwa);

await sql.end();
console.log('done');
