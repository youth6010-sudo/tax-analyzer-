/**
 * 유입프로세스만 있고 유입관리가 없는 건에 스텁 유입관리 행 생성
 * node scripts/backfill-process-inquiries.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import {
  inquiryMatchesProcess,
  upsertInquiryFromProcess,
} from './lib/intake-link.mjs';
import { normalizeCompanyKey } from './lib/client-import-guards.mjs';

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

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

function resolveClientId(clientRows, companyName) {
  const nameKey = normalizeCompanyKey(companyName);
  if (!nameKey) return null;
  const exact = clientRows.find(r => normalizeCompanyKey(r.company_name) === nameKey);
  if (exact) return exact.id;
  for (const r of clientRows) {
    const ck = normalizeCompanyKey(r.company_name);
    if (!ck) continue;
    if (ck.includes(nameKey) || nameKey.includes(ck)) return r.id;
  }
  return null;
}

const processes = await sql`
  SELECT id, client_id, company_name, fee_start_date, monthly_fee, channel, excel_key
  FROM intake_processes
`;
const inquiries = await sql`
  SELECT id, company_name, excel_key, extra
  FROM intake_inquiries
  WHERE coalesce(extra->>'draft', '') != 'true'
`;
const clientRows = await sql`SELECT id, company_name FROM clients`;

let inserted = 0;
let updated = 0;
let skipped = 0;

for (const process of processes) {
  const hasInquiry = inquiries.some(i => inquiryMatchesProcess(i, process));
  if (hasInquiry) {
    skipped++;
    continue;
  }
  const clientId = process.client_id ?? resolveClientId(clientRows, process.company_name);
  const result = await upsertInquiryFromProcess(process, clientId, sql);
  if (result === 'inserted') inserted++;
  else updated++;
  console.log(`✓ [${result}] ${process.company_name}`);
}

await sql.end();
console.log(`\n완료: inserted=${inserted}, updated=${updated}, already linked=${skipped}`);
