/**
 * 팀코리아: 미사용 엠솔루션(블루) 연관으로 담당이 덮인 건 복구
 * - 담당 찰리 복원 (채권회수)
 * - 미사용 엠솔루션 ↔ 팀코리아 연관 해제
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const TK = 'e6b1db2f-9e3a-42ec-93de-46dd6e4781f3';
const UNUSED_MS = '0e0d9156-fb38-4dbb-be9c-348457a79cc7';

const [tk] = await sql`
  SELECT id, company_name, manager, intake_data AS intake
  FROM clients WHERE id = ${TK}
`;
const [ms] = await sql`
  SELECT id, company_name, manager, intake_data AS intake
  FROM clients WHERE id = ${UNUSED_MS}
`;

if (!tk) {
  console.error('팀코리아 missing');
  process.exit(1);
}

const prevMgr = (tk.manager || '').trim();
console.log(`팀코리아 담당: ${prevMgr} → 찰리`);
if (prevMgr !== '찰리') {
  const [user] = await sql`SELECT id FROM users WHERE trim(name) = '찰리' LIMIT 1`;
  await sql`
    UPDATE clients
    SET manager = '찰리',
        assigned_user_id = ${user?.id ?? null},
        updated_at = now()
    WHERE id = ${TK}
  `;
  await sql`
    INSERT INTO client_manager_changes (client_id, previous_manager, new_manager, changed_at)
    VALUES (${TK}, ${prevMgr}, '찰리', now())
  `;
}

function stripRelated(intake, dropName) {
  const next = intake && typeof intake === 'object' && !Array.isArray(intake) ? { ...intake } : {};
  const raw = String(next.relatedCompanies ?? '');
  const kept = raw
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(n => !n.includes(dropName) && n !== dropName);
  if (kept.length) next.relatedCompanies = kept.join(', ');
  else delete next.relatedCompanies;
  delete next.relatedPrimary;
  delete next.relatedPrimaryId;
  return next;
}

const tkIntake = stripRelated(tk.intake, '엠솔루션');
console.log(`팀코리아 related: [${tk.intake?.relatedCompanies || ''}] → [${tkIntake.relatedCompanies || ''}]`);
await sql`UPDATE clients SET intake_data = ${sql.json(tkIntake)}, updated_at = now() WHERE id = ${TK}`;

if (ms) {
  const msIntake = stripRelated(ms.intake, '팀코리아');
  console.log(`미사용 엠솔루션 related: [${ms.intake?.relatedCompanies || ''}] → [${msIntake.relatedCompanies || ''}]`);
  await sql`UPDATE clients SET intake_data = ${sql.json(msIntake)}, updated_at = now() WHERE id = ${UNUSED_MS}`;
}

const [check] = await sql`
  SELECT company_name, manager, coalesce(intake_data->>'relatedCompanies','') AS related
  FROM clients WHERE id = ${TK}
`;
console.log('OK', check);
await sql.end();
