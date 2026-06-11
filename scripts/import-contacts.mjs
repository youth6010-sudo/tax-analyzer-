/**
 * Excel 담당찾기 파일 → public/data/contacts.json 변환
 * 사용: node scripts/import-contacts.mjs [xls경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const xlsPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Desktop', '담당찾기(ver26.03.09).xls');

if (!fs.existsSync(xlsPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsPath);
  process.exit(1);
}

const PHONE_HEADERS = ['핸드폰', '전화', '전화번호', '휴대폰', 'hp', 'tel', '연락처', 'phone', 'mobile'];
const FAX_HEADERS = ['팩스', 'fax'];
const COMPANY_HEADERS = ['상호', '업체명', '거래처', '상호명'];
const MANAGER_HEADERS = ['담당자', '담당'];

function normHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && value > 1000000000) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const normalized = row.map(normHeader);
    if (normalized.some(h => COMPANY_HEADERS.includes(h))) return i;
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {
    company: -1,
    manager: -1,
    phone: -1,
    fax: -1,
  };

  headerRow.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (COMPANY_HEADERS.includes(h)) map.company = idx;
    else if (MANAGER_HEADERS.includes(h)) map.manager = idx;
    else if (PHONE_HEADERS.includes(h)) map.phone = idx;
    else if (FAX_HEADERS.includes(h)) map.fax = idx;
  });

  if (map.company >= 0) {
    if (map.phone < 0 && headerRow.length > map.company + 1) map.phone = map.company + 1;
    if (map.fax < 0 && headerRow.length > map.company + 2) map.fax = map.company + 2;
  }

  return map;
}

function parseContactRows(rows, taxTypes) {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return [];

  const col = buildColumnMap(rows[headerIdx]);
  if (col.company < 0) return [];

  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const companyName = cellText(row[col.company]);
    const manager = col.manager >= 0 ? cellText(row[col.manager]) : '';
    const phone = col.phone >= 0 ? cellText(row[col.phone]) : '';
    const fax = col.fax >= 0 ? cellText(row[col.fax]) : '';

    if (!companyName) continue;
    if (companyName === '상호' || companyName.includes('검색어')) continue;

    parsed.push({ companyName, manager, phone, fax, taxTypes });
  }
  return parsed;
}

function mergeKey(companyName, manager) {
  return `${companyName}||${manager}`;
}

const wb = XLSX.readFile(xlsPath);
const imported = [];

const sheetTaxTypes = {
  data1: ['vat', 'corporate'],
  data2: ['withholding'],
};

for (const sheetName of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const taxTypes = sheetTaxTypes[sheetName] ?? [];
  const parsed = parseContactRows(rows, taxTypes);
  for (const row of parsed) {
    imported.push({ ...row, sheet: sheetName });
  }
}

const outPath = path.join(root, 'public', 'data', 'contacts.json');
const outDir = path.dirname(outPath);
fs.mkdirSync(outDir, { recursive: true });

let existingContacts = [];
if (fs.existsSync(outPath)) {
  try {
    existingContacts = JSON.parse(fs.readFileSync(outPath, 'utf-8')).contacts ?? [];
  } catch {
    existingContacts = [];
  }
}

const existingByKey = new Map(
  existingContacts.map(c => [mergeKey(c.companyName, c.manager), c]),
);
const existingById = new Map(existingContacts.map(c => [c.id, c]));

let nextId = existingContacts.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;

const merged = [];
const seen = new Set();

for (const row of imported) {
  const key = mergeKey(row.companyName, row.manager);
  if (seen.has(key)) continue;
  seen.add(key);

  const prev = existingByKey.get(key);
  const id = prev?.id ?? String(nextId++);

  merged.push({
    id,
    taxTypes: row.taxTypes.length > 0 ? row.taxTypes : (prev?.taxTypes ?? []),
    businessEntityType: prev?.businessEntityType ?? '',
    serviceTypes: prev?.serviceTypes ?? [],
    manager: row.manager || prev?.manager || '',
    companyName: row.companyName,
    representative: prev?.representative ?? '',
    businessNo: prev?.businessNo ?? '',
    corporateNo: prev?.corporateNo ?? '',
    residentNo: prev?.residentNo ?? '',
    phone: row.phone || prev?.phone || '',
    fax: row.fax || prev?.fax || '',
  });
}

for (const prev of existingContacts) {
  const key = mergeKey(prev.companyName, prev.manager);
  if (!seen.has(key)) {
    merged.push(prev);
    seen.add(key);
  }
}

merged.sort((a, b) => Number(a.id) - Number(b.id));

const phoneCount = merged.filter(c => c.phone).length;
const faxCount = merged.filter(c => c.fax).length;
const excelPhoneCount = imported.filter(r => r.phone).length;

fs.writeFileSync(
  outPath,
  JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), contacts: merged }, null, 2),
);

console.log(`✓ ${merged.length}건 → ${outPath}`);
console.log(`  Excel에서 읽은 전화번호: ${excelPhoneCount}건 / ${imported.length}건`);
console.log(`  저장된 전화번호: ${phoneCount}건, 팩스: ${faxCount}건`);

if (excelPhoneCount === 0) {
  console.log('');
  console.log('⚠ Excel data1/data2 시트의 D·E열(핸드폰·팩스)이 비어 있습니다.');
  console.log('  Excel에 전화번호를 입력한 뒤 다시 import 하거나,');
  console.log('  웹에서 거래처 상세 → 수정으로 직접 입력해 주세요.');
}
