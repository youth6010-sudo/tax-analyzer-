/**
 * 홈택스 제출내역조회결과 → 2026년 1~6월 간이지급 접수 체크 + 세션 강제 완료
 * - 6월(및 근로 상반기 H1): 이미 filed=true 인 업체·유형은 건드리지 않음 (직접 작성분 보존)
 * - 홈택스(직접입력) 6월 행도 스킵
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import * as XLSX from 'xlsx';

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

const args = process.argv.slice(2).filter(a => a !== '--dry');
const DRY = process.argv.includes('--dry');
const FILE =
  args[0] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', '제출내역조회결과_20260714.xls');
const YEAR = 2026;

function normalizeBizNo(v) {
  return String(v || '').replace(/\D/g, '');
}

function inferIncomeType(reportName) {
  const t = String(reportName || '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes('근로내용확인')) return 'laborContentReport';
  if (t.includes('일용')) return 'daily';
  if (t.includes('사업')) return 'bizIncome';
  if (t.includes('기타')) return 'otherTax';
  if (t.includes('근로')) return 'employed';
  return null;
}

/** 귀속연월 + 소득유형 → period_key */
function resolvePeriodKey(ymRaw, incomeType) {
  const ym = String(ymRaw || '').trim();
  if (incomeType === 'employed') {
    if (ym.includes('상반기') || ym === `${YEAR}-H1`) return `${YEAR}-H1`;
    if (ym.includes('하반기') || ym === `${YEAR}-H2`) return `${YEAR}-H2`;
    // 월 표기면 상반기(1~6)·하반기(7~12)
    const m = ym.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const month = Number(m[2]);
      if (month >= 1 && month <= 6) return `${YEAR}-H1`;
      if (month >= 7 && month <= 12) return `${YEAR}-H2`;
    }
    return null;
  }
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[1]) === YEAR) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 6) return `${YEAR}-${m[2]}`;
  }
  // 상반기는 월 유형에 해당 없음
  return null;
}

function isJuneProtectedPeriod(periodKey) {
  return periodKey === `${YEAR}-06` || periodKey === `${YEAR}-H1`;
}

function isDirectEntryMethod(method) {
  const s = String(method || '').replace(/\s/g, '');
  return s.includes('직접작성') || s.includes('직접입력');
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (!fs.existsSync(FILE)) {
  console.error('File not found:', FILE);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const buf = fs.readFileSync(FILE);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

let headerIdx = -1;
let cols = null;
for (let i = 0; i < rows.length; i += 1) {
  const cells = (rows[i] || []).map(c => String(c ?? '').replace(/\s/g, ''));
  const reportCol = cells.findIndex(s => s.includes('자료명'));
  const bizCol = cells.findIndex(s => s.includes('지급자'));
  if (reportCol < 0 || bizCol < 0) continue;
  const nameCol = cells.findIndex(s => s.includes('상호') || s.includes('성명'));
  const ymCol = cells.findIndex(s => s.includes('귀속') || s.includes('지급(귀속)'));
  const methodCol = cells.findIndex(s => s.includes('변환') || s.includes('직접'));
  headerIdx = i;
  cols = {
    reportCol,
    bizCol,
    nameCol: nameCol >= 0 ? nameCol : reportCol,
    ymCol: ymCol >= 0 ? ymCol : 5,
    methodCol: methodCol >= 0 ? methodCol : 6,
  };
  break;
}
if (headerIdx < 0 || !cols) {
  console.error('Header not found');
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const clients = await sql`
  SELECT id, company_name, business_no, manager
  FROM clients
  WHERE status IS DISTINCT FROM 'churned'
`;
const byBiz = new Map();
for (const c of clients) {
  const biz = normalizeBizNo(c.business_no);
  if (biz.length === 10 && !byBiz.has(biz)) byBiz.set(biz, c);
}

/** periodKey → Map<clientId|incomeType, {clientId, incomeType, biz, name}> */
const planned = new Map();
let skippedDirectJune = 0;
let skippedNoClient = 0;
let skippedNoType = 0;
let skippedNoPeriod = 0;
let parsed = 0;

for (let i = headerIdx + 1; i < rows.length; i += 1) {
  const r = rows[i];
  if (!Array.isArray(r)) continue;
  const biz = normalizeBizNo(r[cols.bizCol]);
  if (biz.length !== 10) continue;
  const reportName = String(r[cols.reportCol] ?? '').trim();
  const incomeType = inferIncomeType(reportName);
  if (!incomeType || incomeType === 'laborContentReport') {
    skippedNoType += 1;
    continue;
  }
  const ym = String(r[cols.ymCol] ?? '').trim();
  const method = String(r[cols.methodCol] ?? '').trim();
  const periodKey = resolvePeriodKey(ym, incomeType);
  if (!periodKey) {
    skippedNoPeriod += 1;
    continue;
  }
  parsed += 1;

  if (isJuneProtectedPeriod(periodKey) && isDirectEntryMethod(method)) {
    skippedDirectJune += 1;
    continue;
  }

  const client = byBiz.get(biz);
  if (!client) {
    skippedNoClient += 1;
    continue;
  }

  if (!planned.has(periodKey)) planned.set(periodKey, new Map());
  const key = `${client.id}|${incomeType}`;
  planned.get(periodKey).set(key, {
    clientId: client.id,
    incomeType,
    biz,
    name: String(r[cols.nameCol] ?? client.company_name).trim(),
    manager: client.manager || '',
  });
}

/** 6월·H1 이미 수동 접수한 키 */
const protectRows = await sql`
  SELECT client_id, income_type, period_key
  FROM simple_payroll_filings
  WHERE filed = true
    AND period_key IN (${`${YEAR}-06`}, ${`${YEAR}-H1`})
`;
const protectedKeys = new Set(
  protectRows.map(r => `${r.period_key}|${r.client_id}|${r.income_type}`),
);

const toUpsert = [];
let skippedManualJune = 0;
let skippedOutOfRange = 0;
const allowedPeriods = new Set([
  ...Array.from({ length: 6 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`),
  `${YEAR}-H1`,
]);
for (const [periodKey, map] of planned) {
  if (!allowedPeriods.has(periodKey)) {
    skippedOutOfRange += map.size;
    continue;
  }
  for (const item of map.values()) {
    const pk = `${periodKey}|${item.clientId}|${item.incomeType}`;
    if (isJuneProtectedPeriod(periodKey) && protectedKeys.has(pk)) {
      skippedManualJune += 1;
      continue;
    }
    toUpsert.push({
      periodKey,
      clientId: item.clientId,
      incomeType: item.incomeType,
      filed: true,
      acceptanceDate: '',
      acceptanceMethod: '홈택스제출내역',
      notes: '',
    });
  }
}

console.log(
  JSON.stringify(
    {
      file: FILE,
      dry: DRY,
      parsedRows: parsed,
      plannedPeriods: [...planned.keys()].sort(),
      upsertCount: toUpsert.length,
      skippedDirectJune,
      skippedManualJune,
      skippedOutOfRange,
      skippedNoClient,
      skippedNoType,
      skippedNoPeriod,
      protectedJuneKeys: protectedKeys.size,
    },
    null,
    2,
  ),
);

if (!DRY && toUpsert.length > 0) {
  const byPeriod = new Map();
  for (const row of toUpsert) {
    const list = byPeriod.get(row.periodKey) ?? [];
    list.push(row);
    byPeriod.set(row.periodKey, list);
  }
  for (const [periodKey, batch] of byPeriod) {
    for (const row of batch) {
      await sql`
        INSERT INTO simple_payroll_filings (
          client_id, period_key, income_type, filed,
          acceptance_date, acceptance_method, notes, updated_by, updated_at
        ) VALUES (
          ${row.clientId}, ${periodKey}, ${row.incomeType}, true,
          ${row.acceptanceDate}, ${row.acceptanceMethod}, ${row.notes},
          ${'제출내역일괄'}, now()
        )
        ON CONFLICT (client_id, period_key, income_type)
        DO UPDATE SET
          filed = true,
          acceptance_date = CASE
            WHEN simple_payroll_filings.acceptance_date <> '' THEN simple_payroll_filings.acceptance_date
            ELSE EXCLUDED.acceptance_date
          END,
          acceptance_method = CASE
            WHEN simple_payroll_filings.acceptance_method <> '' THEN simple_payroll_filings.acceptance_method
            ELSE EXCLUDED.acceptance_method
          END,
          notes = CASE
            WHEN simple_payroll_filings.notes LIKE '%__inactive__%' THEN ''
            ELSE simple_payroll_filings.notes
          END,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `;
    }
    console.log('upserted', periodKey, batch.length);
  }
}

/** 간이지급 세션 1~6월 강제 완료 */
const managers = [
  ...new Set(clients.map(c => String(c.manager || '').trim()).filter(Boolean)),
];
const monthKeys = Array.from({ length: 6 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`);
let doneSessions = 0;
if (!DRY) {
  for (const manager of managers) {
    for (const periodKey of monthKeys) {
      const existing = await sql`
        SELECT id, data FROM filing_check_sessions
        WHERE manager = ${manager}
          AND tax_type = 'simplePayroll'
          AND period_key = ${periodKey}
        LIMIT 1
      `;
      if (existing[0]) {
        const data = {
          ...(existing[0].data && typeof existing[0].data === 'object' ? existing[0].data : {}),
          done: true,
        };
        await sql`
          UPDATE filing_check_sessions
          SET data = ${sql.json(data)}, updated_at = now()
          WHERE id = ${existing[0].id}
        `;
      } else {
        await sql`
          INSERT INTO filing_check_sessions (manager, tax_type, period_key, data, updated_at)
          VALUES (
            ${manager},
            'simplePayroll',
            ${periodKey},
            ${sql.json({
              done: true,
              overrides: {},
              excelBizNos: [],
              specialReasons: {},
              excluded: {},
              forceIncluded: {},
              rowNotes: {},
              extraClients: [],
            })},
            now()
          )
        `;
      }
      doneSessions += 1;
    }
  }
  console.log('forced done sessions', doneSessions, 'managers', managers.length);
} else {
  console.log('would force done', managers.length, 'managers ×', monthKeys.length, 'months');
}

await sql.end({ timeout: 5 });
console.log(DRY ? 'DRY RUN complete' : 'DONE');
