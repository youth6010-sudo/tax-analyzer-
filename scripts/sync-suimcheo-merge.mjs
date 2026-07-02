/**
 * 더존 수임처 export → 기존 DB 병합 (fee·포털 데이터 유지, 변경분만 갱신)
 * node scripts/sync-suimcheo-merge.mjs [xlsx경로] [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { detectSuimcheoExport, parseSuimcheoExportRows } from './lib/suimcheo-export-parse.mjs';
import { filterImportableClients, normBizNo } from './lib/client-import-guards.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
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
}

loadEnv();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const xlsxPath =
  args.find(a => !a.startsWith('--')) ||
  path.join(process.env.USERPROFILE || '', 'Downloads', '변환파일', '수임처-20260702104054.xlsx');

if (!fs.existsSync(xlsxPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const sheetName = wb.SheetNames.find(n => {
  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
  return detectSuimcheoExport(sheetRows);
});
if (!sheetName) {
  console.error('수임처 export 형식이 아닙니다.');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
const parsed = parseSuimcheoExportRows(rows);
const { importable: excelClients } = filterImportableClients(parsed, { label: 'TP 수임처 export' });

const INCOME_LABELS = {
  employed: '상용',
  daily: '일용',
  retirement: '퇴직',
  bizIncome: '사업',
  interestDividend: '이자배당',
  otherTax: '기타',
  laborContentReport: '근로내용확인신고',
};

const INTAKE_MERGE_KEYS = [
  'douzoneCode',
  'category',
  'team',
  'mainOffice',
  'address',
  'industry',
  'item',
  'openAge',
  'gender',
  'openDate',
  'closedDate',
  'taxKind',
  'convertedDate',
  'taxInvoice',
  'invoiceAvailableDate',
  'filingType',
  'report',
  'email',
  'emailTax',
  'callNote',
  'posVendor',
  'taxOfficeContact',
  'taxOfficePhone',
  'clientContact',
  'relatedCompanies',
  'statusLabel',
  'mobilePhone',
];

function readIncomeTypes(intake) {
  const t = intake?.incomeTypes;
  if (t && typeof t === 'object') {
    return {
      employed: !!t.employed,
      daily: !!t.daily,
      retirement: !!t.retirement,
      bizIncome: !!t.bizIncome,
      interestDividend: !!t.interestDividend,
      otherTax: !!t.otherTax,
      laborContentReport: !!t.laborContentReport,
    };
  }
  const f = intake?.taxFlags ?? {};
  const legacyPayroll = String(intake?.payrollHistory ?? '')
    .trim()
    .toUpperCase();
  const laborFromLegacy = legacyPayroll === 'Y' || legacyPayroll === 'YES';
  return {
    employed: !!f.employed,
    daily: !!f.daily,
    retirement: !!f.retirement,
    bizIncome: !!f.bizIncome,
    interestDividend: !!f.interestDividend,
    otherTax: !!f.otherTax,
    laborContentReport: !!f.laborContentReport || laborFromLegacy,
  };
}

function eq(a, b) {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

function mergeIntake(prev, fromExcel) {
  const next = { ...(prev && typeof prev === 'object' ? prev : {}) };
  for (const k of INTAKE_MERGE_KEYS) {
    const v = fromExcel[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') {
      if (k in next) delete next[k];
    } else {
      next[k] = v;
    }
  }
  if (fromExcel.notes && typeof fromExcel.notes === 'object') {
    const mergedNotes = { ...(next.notes ?? {}) };
    for (const [nk, nv] of Object.entries(fromExcel.notes)) {
      if (String(nv ?? '').trim()) mergedNotes[nk] = nv;
    }
    next.notes = mergedNotes;
  }
  next.incomeTypes = { ...fromExcel.incomeTypes };
  next.taxFlags = { ...fromExcel.taxFlags };
  delete next.payrollHistory;
  if (next.taxFlags) delete next.taxFlags.proxyPay;
  return next;
}

function collectChanges(existing, c, prevIntake, nextIntake) {
  const changes = [];
  const prevIncome = readIncomeTypes(prevIntake);
  const nextIncome = nextIntake.incomeTypes;

  for (const [key, label] of Object.entries(INCOME_LABELS)) {
    if (prevIncome[key] !== nextIncome[key]) {
      changes.push({ kind: 'income', text: `${label}: ${prevIncome[key] ? 'Y' : 'N'} → ${nextIncome[key] ? 'Y' : 'N'}` });
    }
  }

  const scalarFields = [
    ['담당자', c.manager, existing.manager],
    ['대표자', c.representative, existing.representative],
    ['상호', c.companyName, existing.company_name],
    ['연락처', c.phone, existing.phone],
    ['팩스', c.fax, existing.fax],
    ['프로그램', c.program, existing.program],
    ['상태', c.status, existing.status],
    ['법인번호', c.corporateNo, existing.corporate_no],
    ['주민번호', c.residentNo, existing.resident_no],
  ];
  for (const [label, nv, ov] of scalarFields) {
    if (label === '연락처' || label === '팩스') {
      if (!String(nv ?? '').trim() && String(ov ?? '').trim()) continue;
    }
    if (!eq(nv, ov)) {
      changes.push({ kind: 'other', text: `${label}: ${ov || '(없음)'} → ${nv || '(없음)'}` });
    }
  }

  if (c.feeSummary != null && c.feeSummary > 0 && c.feeSummary !== existing.fee_summary) {
    changes.push({
      kind: 'other',
      text: `기장료: ${existing.fee_summary ?? '(없음)'} → ${c.feeSummary}`,
    });
  }

  for (const k of INTAKE_MERGE_KEYS) {
    const ov = String(prevIntake[k] ?? '').trim();
    const nv = String(c.intakeData[k] ?? '').trim();
    if (nv === '' && ov !== '') continue;
    if (ov !== nv && (ov || nv)) {
      changes.push({ kind: 'other', text: `${k}: ${ov || '(없음)'} → ${nv || '(없음)'}` });
    }
  }

  return changes;
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

const dbRows = await sql`
  SELECT id, company_name, manager, representative, business_no, corporate_no, resident_no,
         phone, fax, program, status, fee_summary, intake_data, converted, assigned_user_id
  FROM clients
`;
const byBiz = new Map();
for (const r of dbRows) {
  const biz = normBizNo(r.business_no);
  if (biz.length >= 10 && !byBiz.has(biz)) byBiz.set(biz, r);
}

const userRows = await sql`SELECT id, name, real_name FROM users`;
const userByNick = new Map(userRows.map(u => [u.name.trim(), u.id]));
const userByReal = new Map(userRows.map(u => [u.real_name.trim(), u.id]));

let matched = 0;
let updated = 0;
let unmatched = 0;
const changeLog = [];

for (const c of excelClients) {
  const biz = normBizNo(c.businessNo);
  const existing = biz.length >= 10 ? byBiz.get(biz) : null;
  if (!existing) {
    unmatched += 1;
    continue;
  }
  matched += 1;

  const prevIntake =
    existing.intake_data && typeof existing.intake_data === 'object' ? existing.intake_data : {};
  const nextIntake = mergeIntake(prevIntake, c.intakeData);
  const changes = collectChanges(existing, c, prevIntake, nextIntake);
  const incomeDirty =
    !prevIntake.incomeTypes ||
    Object.keys(INCOME_LABELS).some(
      key => !!prevIntake.incomeTypes?.[key] !== !!nextIntake.incomeTypes?.[key],
    );

  if (changes.length === 0 && !incomeDirty) continue;

  updated += 1;
  if (changes.length > 0) {
    changeLog.push({
      company: c.companyName,
      biz: c.businessNo,
      manager: c.manager,
      changes,
    });
  }

  if (!dryRun) {
    const assignedUserId =
      userByNick.get(c.manager) ?? userByReal.get(c.managerReal) ?? existing.assigned_user_id;
    const nextFee =
      c.feeSummary != null && c.feeSummary > 0 ? c.feeSummary : existing.fee_summary;
    const nextPhone = c.phone?.trim() ? c.phone : existing.phone;
    const nextFax = c.fax?.trim() ? c.fax : existing.fax;
    await sql`
      UPDATE clients SET
        company_name = ${c.companyName},
        manager = ${c.manager},
        representative = ${c.representative},
        corporate_no = ${c.corporateNo},
        resident_no = ${c.residentNo},
        phone = ${nextPhone},
        fax = ${nextFax},
        program = ${c.program},
        status = ${c.status},
        converted = ${c.converted},
        fee_summary = ${nextFee},
        assigned_user_id = COALESCE(${assignedUserId}, assigned_user_id),
        intake_data = ${sql.json(nextIntake)},
        updated_at = NOW()
      WHERE id = ${existing.id}
    `;
  }
}

await sql.end();

const incomeOnly = changeLog.filter(e => e.changes.some(ch => ch.kind === 'income'));
const incomeCount = changeLog.reduce(
  (n, e) => n + e.changes.filter(ch => ch.kind === 'income').length,
  0,
);

console.log(`\n=== 수임처 엑셀 병합 ${dryRun ? '(dry-run)' : '완료'} ===`);
console.log(`파일: ${path.basename(xlsxPath)}`);
console.log(
  `엑셀 ${excelClients.length}건 · DB 매칭 ${matched}건 · 미매칭 ${unmatched}건 · 반영 업체 ${updated}건 · 로그에 표시된 변경 ${changeLog.length}건 · 소득유형 항목 변경 ${incomeCount}건\n`,
);

if (incomeOnly.length > 0) {
  console.log('--- 소득유형(체크박스) 변경 ---');
  for (const e of incomeOnly.slice(0, 80)) {
    const lines = e.changes.filter(ch => ch.kind === 'income').map(ch => ch.text);
    console.log(`· ${e.company} (${e.biz}) [${e.manager}]`);
    for (const l of lines) console.log(`    ${l}`);
  }
  if (incomeOnly.length > 80) console.log(`… 외 ${incomeOnly.length - 80}건`);
}

const otherOnly = changeLog.filter(e => e.changes.some(ch => ch.kind === 'other'));
if (otherOnly.length > 0) {
  console.log('\n--- 기타 수임처 정보 변경 ---');
  for (const e of otherOnly.slice(0, 40)) {
    const lines = e.changes.filter(ch => ch.kind === 'other').map(ch => ch.text);
    console.log(`· ${e.company} (${e.biz})`);
    for (const l of lines.slice(0, 8)) console.log(`    ${l}`);
    if (lines.length > 8) console.log(`    … 외 ${lines.length - 8}항목`);
  }
  if (otherOnly.length > 40) console.log(`… 외 ${otherOnly.length - 40}건`);
}

if (changeLog.length === 0) {
  console.log('변경된 항목이 없습니다 (DB와 엑셀이 이미 동일).');
}
