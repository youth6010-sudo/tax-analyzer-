// Neon → Supabase(또는 임의 Postgres) 데이터 복사.
//   사용:  node scripts/migrate-db.mjs
//   필요 env (.env.local 또는 셸):
//     SOURCE_DATABASE_URL  = 현재 Neon URL (없으면 DATABASE_URL 사용)
//     TARGET_DATABASE_URL  = 이전 대상 Supabase URL (스키마는 미리 생성돼 있어야 함)
//   대상 스키마는 먼저 `drizzle-kit push` + ensure-*.mjs 로 만들어 둘 것.
//   각 테이블을 TRUNCATE 후 source 데이터를 그대로 INSERT 한다(FK 순서 고려).
import fs from 'fs';
import postgres from 'postgres';

for (const name of ['.env.local', '.env']) {
  if (!fs.existsSync(name)) continue;
  for (const l of fs.readFileSync(name, 'utf8').split('\n')) {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const SOURCE = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const TARGET = process.env.TARGET_DATABASE_URL;
if (!SOURCE || !TARGET) {
  console.error('SOURCE_DATABASE_URL(또는 DATABASE_URL) 와 TARGET_DATABASE_URL 이 필요합니다.');
  process.exit(1);
}
function hostDb(u) {
  try {
    const url = new URL(u);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return u;
  }
}
// 같은 DB(호스트+DB명)면 중단 — 포트만 다른 경우(풀러 5432/6543)도 차단.
if (SOURCE === TARGET || hostDb(SOURCE).replace(/^aws-\d+-/, '') === hostDb(TARGET).replace(/^aws-\d+-/, '')) {
  console.error('SOURCE 와 TARGET 이 같은 데이터베이스를 가리킵니다. 중단합니다.');
  console.error('  SOURCE:', hostDb(SOURCE), '\n  TARGET:', hostDb(TARGET));
  process.exit(1);
}

// FK 의존성 순서 (부모 → 자식). users·clients 가 먼저.
const ORDER = [
  'users',
  'app_config',
  'lunch_spot_requests',
  'clients',
  'client_contacts',
  'client_fee_changes',
  'client_fee_import_pending',
  'churn_records',
  'intake_inquiries',
  'intake_processes',
  'bluehole_sync_log',
  'report_deliveries',
  'client_meetings',
  'settlement_visits',
  'tax_filing_checks',
  'work_checklists',
];

const src = postgres(SOURCE, { max: 4, prepare: false });
const dst = postgres(TARGET, { max: 4, prepare: false });

async function existingTables(sql) {
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`;
  return new Set(rows.map(r => r.table_name));
}

async function tableColumns(sql, table) {
  const rows = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table}`;
  return new Set(rows.map(r => r.column_name));
}

try {
  const srcTables = await existingTables(src);
  const dstTables = await existingTables(dst);

  // ORDER 에 없는 테이블도 누락되지 않게 뒤에 덧붙임
  const tables = [...ORDER.filter(t => srcTables.has(t)), ...[...srcTables].filter(t => !ORDER.includes(t))];

  console.log('대상에 존재하는 테이블:', [...dstTables].sort().join(', '));

  // 자식 → 부모 역순으로 TRUNCATE (FK 회피). RESTART IDENTITY CASCADE.
  for (const t of [...tables].reverse()) {
    if (!dstTables.has(t)) continue;
    await dst`TRUNCATE TABLE ${dst(t)} RESTART IDENTITY CASCADE`;
  }

  let grandTotal = 0;
  for (const t of tables) {
    if (!dstTables.has(t)) {
      console.warn(`! 대상에 ${t} 없음 — 건너뜀 (스키마 push 했는지 확인)`);
      continue;
    }
    const rows = await src`SELECT * FROM ${src(t)}`;
    if (rows.length === 0) {
      console.log(`· ${t}: 0`);
      continue;
    }
    // source/target 공통 컬럼만 복사 (레거시 drift 컬럼은 건너뜀)
    const dstCols = await tableColumns(dst, t);
    const srcCols = Object.keys(rows[0]);
    const cols = srcCols.filter(c => dstCols.has(c));
    const skipped = srcCols.filter(c => !dstCols.has(c));
    if (skipped.length) console.log(`  (${t} 건너뛴 컬럼: ${skipped.join(', ')})`);
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      await dst`INSERT INTO ${dst(t)} ${dst(slice, ...cols)}`;
    }
    grandTotal += rows.length;
    console.log(`✓ ${t}: ${rows.length}`);
  }
  console.log(`\n완료 — 총 ${grandTotal} 행 복사.`);
} catch (e) {
  console.error('마이그레이션 실패:', e);
  process.exitCode = 1;
} finally {
  await src.end({ timeout: 5 });
  await dst.end({ timeout: 5 });
}
