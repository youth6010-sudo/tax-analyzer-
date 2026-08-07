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

const sql = postgres(url, { max: 1, prepare: false });

try {
  const rows = await sql`
    select id, company_name, intake_data
    from clients
    where company_name ilike ${'%건축사사무소환인%'}
       or company_name ilike ${'%건축사무소환인%'}
  `;
  if (rows.length === 0) {
    console.log('대상 수임처를 찾지 못했습니다.');
  } else {
    for (const row of rows) {
      const intake =
        row.intake_data && typeof row.intake_data === 'object' ? { ...row.intake_data } : {};
      intake.fiscalYearEndMonth = 6;
      await sql`
        update clients
        set intake_data = ${sql.json(intake)}, updated_at = now()
        where id = ${row.id}
      `;
      console.log('✓', row.company_name, '→ fiscalYearEndMonth=6');
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
