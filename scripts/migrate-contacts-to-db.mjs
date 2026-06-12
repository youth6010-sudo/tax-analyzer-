/**
 * public/data/contacts.json → Postgres clients
 * node scripts/migrate-contacts-to-db.mjs
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

const jsonPath = path.join(root, 'public', 'data', 'contacts.json');
const { contacts } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const sql = postgres(dbUrl, { max: 1 });

const userRows = await sql`SELECT id, name FROM users`;
const userByName = new Map(userRows.map(u => [u.name.trim(), u.id]));
const existingRows = await sql`SELECT id, company_name, manager, status FROM clients`;

let inserted = 0;
let updated = 0;
let skipped = 0;

for (const c of contacts) {
  const manager = (c.manager ?? '').trim();
  const companyName = (c.companyName ?? '').trim();
  if (!companyName) continue;

  const key = `${companyName}||${manager}`;
  const existing = existingRows.find(r => `${r.company_name}||${r.manager}` === key);
  const assignedUserId = userByName.get(manager) ?? null;

  const payload = {
    companyName,
    manager,
    representative: c.representative ?? '',
    businessNo: c.businessNo ?? '',
    corporateNo: c.corporateNo ?? '',
    residentNo: c.residentNo ?? '',
    phone: c.phone ?? '',
    fax: c.fax ?? '',
    taxTypes: JSON.stringify(c.taxTypes ?? []),
    businessEntityType: c.businessEntityType ?? '',
    serviceTypes: JSON.stringify(c.serviceTypes ?? []),
  };

  if (existing) {
    if (existing.status === 'intake' || existing.status === 'churned') {
      skipped++;
      continue;
    }
    await sql`
      UPDATE clients SET
        company_name = ${payload.companyName},
        manager = ${payload.manager},
        representative = ${payload.representative},
        business_no = ${payload.businessNo},
        corporate_no = ${payload.corporateNo},
        resident_no = ${payload.residentNo},
        phone = ${payload.phone},
        fax = ${payload.fax},
        tax_types = ${payload.taxTypes}::jsonb,
        business_entity_type = ${payload.businessEntityType},
        service_types = ${payload.serviceTypes}::jsonb,
        assigned_user_id = ${assignedUserId},
        updated_at = NOW()
      WHERE id = ${existing.id}
    `;
    updated++;
  } else {
    await sql`
      INSERT INTO clients (
        id, company_name, manager, representative, business_no, corporate_no,
        resident_no, phone, fax, tax_types, business_entity_type, service_types,
        status, source, assigned_user_id
      ) VALUES (
        ${c.id}, ${payload.companyName}, ${payload.manager}, ${payload.representative},
        ${payload.businessNo}, ${payload.corporateNo}, ${payload.residentNo},
        ${payload.phone}, ${payload.fax}, ${payload.taxTypes}::jsonb,
        ${payload.businessEntityType}, ${payload.serviceTypes}::jsonb,
        'active', 'tp_import', ${assignedUserId}
      )
    `;
    inserted++;
  }
}

await sql.end();
console.log(`Migration done: inserted=${inserted}, updated=${updated}, skipped=${skipped}`);
