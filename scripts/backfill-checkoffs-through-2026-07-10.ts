/**
 * 올해 7/10까지(포함) 일정 → 전 담당자 완료 체크 일괄 처리
 *   npx tsx scripts/backfill-checkoffs-through-2026-07-10.ts
 *   npx tsx scripts/backfill-checkoffs-through-2026-07-10.ts --dry
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { listTaxDeadlines } from '../lib/taxDeadlineCalendar';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env'] as const) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const DRY = process.argv.includes('--dry');
const CUTOFF = '2026-07-10';
const COMPLETED_AT = new Date('2026-07-10T18:00:00+09:00');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

async function main() {
  try {
    await sql.unsafe(
      fs.readFileSync(path.join(root, 'drizzle', '0009_tax_deadline_checkoffs.sql'), 'utf8'),
    );

    const members = (await sql`SELECT name FROM users ORDER BY name`)
      .map(r => String(r.name || '').trim())
      .filter(Boolean);

    if (members.length === 0) {
      console.error('담당자(users) 없음');
      process.exit(1);
    }

    const company = await sql`
      SELECT id, title, start_date
      FROM company_events
      WHERE start_date <= ${CUTOFF}
      ORDER BY start_date
    `;

    const tax = listTaxDeadlines('2025-01-01', CUTOFF).filter(d => d.date <= CUTOFF);

    console.log(`컷오프: ${CUTOFF}`);
    console.log(`담당자 ${members.length}명: ${members.join(', ')}`);
    console.log(`회사 일정: ${company.length}건 · 세무신고: ${tax.length}건`);

    if (DRY) {
      console.log('[dry] 회사:', company.slice(0, 8));
      console.log('[dry] 세무:', tax.slice(0, 8).map(d => `${d.date} ${d.title}`));
      return;
    }

    let companyRows = 0;
    for (const ev of company) {
      for (const name of members) {
        await sql`
          INSERT INTO company_event_checkoffs (event_id, member_name, completed, completed_at)
          VALUES (${ev.id}, ${name}, true, ${COMPLETED_AT})
          ON CONFLICT (event_id, member_name) DO UPDATE SET
            completed = true,
            completed_at = COALESCE(company_event_checkoffs.completed_at, EXCLUDED.completed_at)
        `;
        companyRows += 1;
      }
    }

    let taxRows = 0;
    for (const d of tax) {
      for (const name of members) {
        await sql`
          INSERT INTO tax_deadline_checkoffs (deadline_id, member_name, completed, completed_at)
          VALUES (${d.id}, ${name}, true, ${COMPLETED_AT})
          ON CONFLICT (deadline_id, member_name) DO UPDATE SET
            completed = true,
            completed_at = COALESCE(tax_deadline_checkoffs.completed_at, EXCLUDED.completed_at)
        `;
        taxRows += 1;
      }
    }

    console.log(`✓ 회사 체크오프 ${companyRows}행 · 세무신고 체크오프 ${taxRows}행 반영 (완료일 ${CUTOFF})`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
