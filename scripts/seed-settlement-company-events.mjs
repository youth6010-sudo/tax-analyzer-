/**
 * 세무 결산 일정을 회사업무(company_events)로 전체 등록
 * - 9/30: 해당연도 2/4분기 결산
 * - 12/31: 해당연도 3/4분기 결산(가결산)
 * - 익년 2월말: 전연도 결산(법인 보고서)
 * - 익년 5/15: 전연도 결산(개인 보고서)
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

const DRY = process.argv.includes('--dry');
const FROM_YEAR = Number(process.argv.find(a => a.startsWith('--from='))?.slice(7) || 2026);
const TO_YEAR = Number(process.argv.find(a => a.startsWith('--to='))?.slice(5) || 2027);

function lastDayOfFebruary(year) {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-02-${isLeap ? '29' : '28'}`;
}

/** 결산 대상 연도 Y 기준 4건 */
function eventsForSettlementYear(Y) {
  return [
    {
      title: `${Y}년 2/4분기 결산`,
      description: '회사업무 · 2/4분기 결산 마감',
      startDate: `${Y}-09-30`,
    },
    {
      title: `${Y}년 3/4분기 결산(가결산)`,
      description: '회사업무 · 3/4분기 결산(가결산) 마감',
      startDate: `${Y}-12-31`,
    },
    {
      title: `${Y}년 결산(법인 보고서)`,
      description: '회사업무 · 전연도 결산(법인 보고서) · 익년 2월말까지',
      startDate: lastDayOfFebruary(Y + 1),
    },
    {
      title: `${Y}년 결산(개인 보고서)`,
      description: '회사업무 · 전연도 결산(개인 보고서) · 익년 5월 중순까지',
      startDate: `${Y + 1}-05-15`,
    },
  ];
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const planned = [];
for (let y = FROM_YEAR; y <= TO_YEAR; y += 1) {
  planned.push(...eventsForSettlementYear(y));
}

const existing = await sql`
  SELECT id, title, start_date
  FROM company_events
  WHERE title LIKE '%결산%'
`;
const existingKeys = new Set(existing.map(r => `${r.title}|${r.start_date}`));

const toInsert = planned.filter(e => !existingKeys.has(`${e.title}|${e.startDate}`));

console.log(
  JSON.stringify(
    {
      dry: DRY,
      years: `${FROM_YEAR}-${TO_YEAR}`,
      planned: planned.length,
      already: planned.length - toInsert.length,
      insert: toInsert.length,
      items: toInsert,
    },
    null,
    2,
  ),
);

if (!DRY && toInsert.length > 0) {
  for (const e of toInsert) {
    await sql`
      INSERT INTO company_events (
        title, description, start_date, end_date, schedule_kind, all_day, created_by, created_at, updated_at
      ) VALUES (
        ${e.title},
        ${e.description},
        ${e.startDate},
        ${e.startDate},
        'deadline',
        true,
        '시스템',
        now(),
        now()
      )
    `;
  }
  console.log('inserted', toInsert.length);
}

await sql.end({ timeout: 5 });
console.log(DRY ? 'DRY RUN complete' : 'DONE');
