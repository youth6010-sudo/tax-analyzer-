/**
 * 홈택스 신고접수내역 → 2026-06 원천세 신고대상확인 접수 완료 + 세션 done
 * 7월은 전월(6월) 접수·제외 승계로 리스트가 잡히도록 6월을 기준 완료 처리
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
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    '신고접수내역조회(youth6007)_20260717181605.xls',
  );
const YEAR = 2026;
const PERIOD_KEY = `${YEAR}-06`;
const TAX_TYPE = 'withholding';

function normalizeBizNo(v) {
  return String(v || '').replace(/\D/g, '');
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const cells = (rows[i] || []).map(c => String(c ?? '').replace(/\s/g, ''));
    const bizCol = cells.findIndex(
      s => s.includes('등록번호') || s.includes('사업자') || s.includes('주민등록'),
    );
    const nameCol = cells.findIndex(s => s.includes('상호') || s.includes('성명'));
    const typeCol = cells.findIndex(s => s.includes('신고유형') || s.includes('신고구분'));
    if (bizCol < 0) continue;
    return {
      headerIdx: i,
      bizCol,
      nameCol: nameCol >= 0 ? nameCol : -1,
      typeCol: typeCol >= 0 ? typeCol : -1,
    };
  }
  return null;
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
const header = findHeader(rows);
if (!header) {
  console.error('Header not found. First rows:');
  for (let i = 0; i < Math.min(8, rows.length); i += 1) {
    console.log(i, (rows[i] || []).slice(0, 12));
  }
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const excelBizNos = [];
const excelNamesByBiz = {};
const specialMap = new Map();

for (let i = header.headerIdx + 1; i < rows.length; i += 1) {
  const r = rows[i];
  if (!Array.isArray(r)) continue;
  const biz = normalizeBizNo(r[header.bizCol]);
  if (biz.length !== 10) continue;
  if (!excelBizNos.includes(biz)) excelBizNos.push(biz);
  const name = header.nameCol >= 0 ? String(r[header.nameCol] ?? '').trim() : '';
  if (name && !excelNamesByBiz[biz]) excelNamesByBiz[biz] = name;
  const filingType = header.typeCol >= 0 ? String(r[header.typeCol] ?? '').trim() : '';
  const t = filingType.replace(/\s/g, '');
  let special = null;
  if (t.includes('기한후')) special = '기한후신고';
  else if (t.includes('수정')) special = '수정신고';
  else if (t.includes('경정')) special = '경정청구';
  if (special) {
    const key = `${biz}|${special}`;
    const prev = specialMap.get(key);
    if (prev) prev.count += 1;
    else
      specialMap.set(key, {
        bizNo: biz,
        name: name || excelNamesByBiz[biz] || biz,
        type: special,
        count: 1,
      });
  }
}

const specialFilings = [...specialMap.values()];

const clients = await sql`
  SELECT id, company_name, business_no, manager, status
  FROM clients
`;
const byBiz = new Map();
for (const c of clients) {
  const biz = normalizeBizNo(c.business_no);
  if (biz.length === 10 && !byBiz.has(biz)) byBiz.set(biz, c);
}

const matchedClients = [];
const missing = [];
for (const biz of excelBizNos) {
  const c = byBiz.get(biz);
  if (c) matchedClients.push(c);
  else missing.push(excelNamesByBiz[biz] || biz);
}

const managers = [
  ...new Set(
    matchedClients
      .map(c => String(c.manager || '').trim())
      .filter(Boolean),
  ),
];
// 담당자 세션이 없어도 전체 담당 목록 기준으로 완료 처리
const allManagers = [
  ...new Set(clients.map(c => String(c.manager || '').trim()).filter(Boolean)),
];

console.log(
  JSON.stringify(
    {
      file: FILE,
      dry: DRY,
      periodKey: PERIOD_KEY,
      excelCount: excelBizNos.length,
      matchedClients: matchedClients.length,
      missing: missing.slice(0, 20),
      missingCount: missing.length,
      specialFilings: specialFilings.length,
      managers: allManagers.length,
    },
    null,
    2,
  ),
);

function baseSessionData(existing) {
  const prev =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  return {
    overrides: {},
    excelBizNos,
    excelNamesByBiz,
    fileName: path.basename(FILE),
    diffReason: prev.diffReason || '',
    done: true,
    specialFilings,
    specialReasons: prev.specialReasons && typeof prev.specialReasons === 'object' ? prev.specialReasons : {},
    excluded: prev.excluded && typeof prev.excluded === 'object' ? prev.excluded : {},
    forceIncluded: prev.forceIncluded && typeof prev.forceIncluded === 'object' ? prev.forceIncluded : {},
    rowNotes: prev.rowNotes && typeof prev.rowNotes === 'object' ? prev.rowNotes : {},
    extraClients: Array.isArray(prev.extraClients) ? prev.extraClients : [],
    clientOrder: Array.isArray(prev.clientOrder) ? prev.clientOrder : undefined,
  };
}

let updated = 0;
let inserted = 0;
if (!DRY) {
  for (const manager of allManagers) {
    const existing = await sql`
      SELECT id, data FROM filing_check_sessions
      WHERE manager = ${manager}
        AND tax_type = ${TAX_TYPE}
        AND period_key = ${PERIOD_KEY}
      LIMIT 1
    `;
    const data = baseSessionData(existing[0]?.data);
    if (existing[0]) {
      await sql`
        UPDATE filing_check_sessions
        SET data = ${sql.json(data)}, updated_at = now()
        WHERE id = ${existing[0].id}
      `;
      updated += 1;
    } else {
      await sql`
        INSERT INTO filing_check_sessions (manager, tax_type, period_key, data, updated_at)
        VALUES (${manager}, ${TAX_TYPE}, ${PERIOD_KEY}, ${sql.json(data)}, now())
      `;
      inserted += 1;
    }
  }
  console.log('withholding June sessions updated', updated, 'inserted', inserted);
} else {
  console.log('would upsert sessions for', allManagers.length, 'managers');
}

await sql.end({ timeout: 5 });
console.log(DRY ? 'DRY RUN complete' : 'DONE');
