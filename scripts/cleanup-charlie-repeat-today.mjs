/**
 * 오늘(KST) 찰리가 만든 반복 배치 개인 체크리스트 삭제
 * — 같은 title/tax_type/client_id + created_at 분 단위로 2건 이상인 그룹만
 *
 * Usage: node scripts/cleanup-charlie-repeat-today.mjs [--dry-run]
 */
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

const dryRun = process.argv.includes('--dry-run');
const sql = postgres(url, { max: 1, prepare: false });

try {
  const groups = await sql`
    WITH today_items AS (
      SELECT
        id,
        title,
        tax_type,
        client_id,
        due_date,
        created_at,
        date_trunc('minute', created_at AT TIME ZONE 'Asia/Seoul') AS created_minute
      FROM personal_checklist_items
      WHERE owner_name = '찰리'
        AND (created_at AT TIME ZONE 'Asia/Seoul')::date
          = (now() AT TIME ZONE 'Asia/Seoul')::date
    ),
    batches AS (
      SELECT title, tax_type, client_id, created_minute, count(*)::int AS cnt
      FROM today_items
      GROUP BY title, tax_type, client_id, created_minute
      HAVING count(*) >= 2
    )
    SELECT t.id, t.title, t.tax_type, t.client_id, t.due_date, t.created_at, b.cnt
    FROM today_items t
    INNER JOIN batches b
      ON t.title = b.title
      AND t.tax_type = b.tax_type
      AND t.client_id IS NOT DISTINCT FROM b.client_id
      AND t.created_minute = b.created_minute
    ORDER BY t.title, t.due_date
  `;

  console.log(`대상 ${groups.length}건 (배치 반복, KST 오늘, 찰리)`);
  for (const row of groups.slice(0, 30)) {
    console.log(
      `  - ${row.title} | ${row.due_date} | ${row.tax_type} | batch=${row.cnt} | ${row.created_at}`,
    );
  }
  if (groups.length > 30) console.log(`  … 외 ${groups.length - 30}건`);

  if (groups.length === 0) {
    console.log('삭제할 항목 없음');
  } else if (dryRun) {
    console.log('--dry-run: 삭제하지 않음');
  } else {
    const ids = groups.map(r => r.id);
    const deleted = await sql`
      DELETE FROM personal_checklist_items
      WHERE id = ANY(${ids}::uuid[])
      RETURNING id
    `;
    console.log(`✓ 삭제 ${deleted.length}건`);
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
