/**
 * Vercel(Neon) DB에 휴가 컬럼 마이그레이션 + 환인 6월말 설정
 * Usage: node scripts/fix-vercel-db.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const vercelDev = loadEnvFile('.env.vercel.check');
const vercelProd = loadEnvFile('.env.vercel.prod');
const local = loadEnvFile('.env.local');

const urls = [];
for (const [label, url] of [
  ['vercel-development', vercelDev.DATABASE_URL],
  ['vercel-production', vercelProd.DATABASE_URL],
  ['vercel-preview', loadEnvFile('.env.vercel.preview').DATABASE_URL],
]) {
  if (url && url.length > 10) urls.push([label, url]);
}

// production pull may be empty (Sensitive) — if only Neon development known, use that
if (urls.length === 0 && vercelDev.DATABASE_URL) {
  urls.push(['vercel-development', vercelDev.DATABASE_URL]);
}

if (urls.length === 0) {
  console.error('No Vercel DATABASE_URL found. Run: vercel env pull .env.vercel.check --yes');
  process.exit(1);
}

const sql0019 = fs.readFileSync(path.join(root, 'drizzle', '0019_leave_approval_step.sql'), 'utf8');
const sql0020 = fs.readFileSync(path.join(root, 'drizzle', '0020_leave_cancel_request.sql'), 'utf8');

async function fix(label, url) {
  let host = '?';
  try {
    host = new URL(url).host;
  } catch {
    /* ignore */
  }
  console.log(`\n=== ${label} (${host}) ===`);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(sql0019);
    console.log('✓ approval_step migration');
    await sql.unsafe(sql0020);
    console.log('✓ cancel_request migration');

    const hwain = await sql`
      select id, company_name, intake_data
      from clients
      where company_name ilike ${'%건축사사무소환인%'}
         or company_name ilike ${'%건축사무소환인%'}
    `;
    for (const row of hwain) {
      const intake =
        row.intake_data && typeof row.intake_data === 'object' && !Array.isArray(row.intake_data)
          ? { ...row.intake_data }
          : {};
      intake.fiscalYearEndMonth = 6;
      await sql`
        update clients
        set intake_data = ${sql.json(intake)},
            updated_at = now()
        where id = ${row.id}
      `;
      console.log('✓', row.company_name, '→ fiscalYearEndMonth=6');
    }
    if (hwain.length === 0) console.log('(환인 업체 없음)');

    const cols = await sql`
      select column_name from information_schema.columns
      where table_name = 'leave_requests'
        and column_name in (
          'approval_step',
          'cancel_request_note',
          'cancel_requested_at',
          'cancel_request_from_status'
        )
      order by 1
    `;
    console.log(
      'leave cols now:',
      cols.map(c => c.column_name).join(', ') || '(none)',
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

for (const [label, url] of urls) {
  await fix(label, url);
}

// also try TARGET if it looks like a third host
if (local.TARGET_DATABASE_URL) {
  try {
    const th = new URL(local.TARGET_DATABASE_URL).host;
    const already = urls.some(([, u]) => {
      try {
        return new URL(u).host === th;
      } catch {
        return false;
      }
    });
    if (!already && !th.includes('supabase')) {
      await fix('TARGET_DATABASE_URL', local.TARGET_DATABASE_URL);
    }
  } catch {
    /* ignore */
  }
}

console.log('\nDone.');
