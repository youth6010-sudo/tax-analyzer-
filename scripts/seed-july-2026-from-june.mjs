/**
 * 6월 완료 기준으로 2026-07 원천세·간이지급 세션 시드
 * - 원천세: 6월 제외·강제포함·특이·추가업체 승계, 접수는 비움
 * - 간이지급: 7월 세션 done=false 로 열어두고, 리스트 활성은 6월 filed 기준(prevFiled)
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
const YEAR = 2026;
const FROM = `${YEAR}-06`;
const TO = `${YEAR}-07`;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function carryFrom(june) {
  const d = asObj(june);
  return {
    overrides: {},
    excelBizNos: [],
    excelNamesByBiz: {},
    fileName: '',
    diffReason: typeof d.diffReason === 'string' ? d.diffReason : '',
    done: false,
    specialFilings: [],
    specialReasons: asObj(d.specialReasons),
    excluded: asObj(d.excluded),
    forceIncluded: asObj(d.forceIncluded),
    rowNotes: asObj(d.rowNotes),
    extraClients: Array.isArray(d.extraClients) ? d.extraClients : [],
    ...(Array.isArray(d.clientOrder) ? { clientOrder: d.clientOrder } : {}),
  };
}

async function seedTax(taxType) {
  const juneRows = await sql`
    SELECT manager, data FROM filing_check_sessions
    WHERE tax_type = ${taxType} AND period_key = ${FROM}
  `;
  let updated = 0;
  let inserted = 0;
  for (const row of juneRows) {
    const manager = String(row.manager || '').trim();
    if (!manager) continue;
    const data = carryFrom(row.data);
    const existing = await sql`
      SELECT id, data FROM filing_check_sessions
      WHERE manager = ${manager}
        AND tax_type = ${taxType}
        AND period_key = ${TO}
      LIMIT 1
    `;
    if (DRY) {
      console.log('would seed', taxType, manager, {
        excluded: Object.keys(data.excluded).length,
        forceIncluded: Object.keys(data.forceIncluded).length,
        extraClients: data.extraClients.length,
        rowNotes: Object.keys(data.rowNotes).length,
      });
      continue;
    }
    if (existing[0]) {
      // 이미 7월 접수가 있으면 승계 필드만 보강(접수는 유지)
      const cur = asObj(existing[0].data);
      const merged = {
        ...data,
        overrides: asObj(cur.overrides),
        excelBizNos: Array.isArray(cur.excelBizNos) ? cur.excelBizNos : [],
        excelNamesByBiz: asObj(cur.excelNamesByBiz),
        fileName: typeof cur.fileName === 'string' ? cur.fileName : '',
        specialFilings: Array.isArray(cur.specialFilings) ? cur.specialFilings : [],
        done: cur.done === true,
        excluded: { ...data.excluded, ...asObj(cur.excluded) },
        forceIncluded: { ...data.forceIncluded, ...asObj(cur.forceIncluded) },
        rowNotes: { ...data.rowNotes, ...asObj(cur.rowNotes) },
        extraClients:
          Array.isArray(cur.extraClients) && cur.extraClients.length > 0
            ? cur.extraClients
            : data.extraClients,
      };
      await sql`
        UPDATE filing_check_sessions
        SET data = ${sql.json(merged)}, updated_at = now()
        WHERE id = ${existing[0].id}
      `;
      updated += 1;
    } else {
      await sql`
        INSERT INTO filing_check_sessions (manager, tax_type, period_key, data, updated_at)
        VALUES (${manager}, ${taxType}, ${TO}, ${sql.json(data)}, now())
      `;
      inserted += 1;
    }
  }
  return { taxType, juneSessions: juneRows.length, updated, inserted };
}

const wh = await seedTax('withholding');
const sp = await seedTax('simplePayroll');

const juneFiled = await sql`
  SELECT count(*)::int AS n FROM simple_payroll_filings
  WHERE filed = true AND period_key IN (${`${YEAR}-06`}, ${`${YEAR}-H1`})
`;

console.log(
  JSON.stringify(
    {
      dry: DRY,
      withholdingJuly: wh,
      simplePayrollJuly: sp,
      juneOrH1FiledRows: juneFiled[0]?.n ?? 0,
      note: '7월 간이지급 활성 칸은 6월·H1 filed 기준으로 자동 이월됩니다.',
    },
    null,
    2,
  ),
);

await sql.end({ timeout: 5 });
console.log(DRY ? 'DRY RUN complete' : 'DONE');
