/**
 * 더존 연락처 export → client_contacts
 * node scripts/import-douzone-contacts.mjs [xlsx경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import postgres from 'postgres';

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

const xlsxPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Desktop', '연락처-20260615105259.xlsx');

if (!fs.existsSync(xlsxPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsxPath);
  process.exit(1);
}

function isMobile(raw) {
  const d = String(raw).replace(/\D/g, '');
  return /^01[016789]/.test(d);
}

function splitPhone(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return { phone: '', mobilePhone: '' };
  if (isMobile(t)) return { phone: '', mobilePhone: t };
  return { phone: t, mobilePhone: '' };
}

const ROLE_PATTERNS = [
  [/사모|사모님/, '사모'],
  [/노무/, '담당_노무사'],
  [/대표|대표님/, '대표'],
  [/사장|사장님/, '사장'],
  [/이사/, '이사'],
  [/과장/, '과장'],
  [/실장/, '실장'],
  [/팀장|부장|원장|매니저|대리|직원|실무/, '직원'],
];

function parseNameRole(raw) {
  const t = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return { name: '', role: '' };
  for (const [pattern, role] of ROLE_PATTERNS) {
    if (pattern.test(t)) {
      const name = t.replace(pattern, '').replace(/님$/g, '').trim() || t;
      return { name, role };
    }
  }
  return { name: t, role: '' };
}

function normBizNo(v) {
  return String(v ?? '').replace(/\D/g, '');
}

const wb = XLSX.readFile(xlsxPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log(`파싱: ${rows.length}행 ← ${path.basename(xlsxPath)}`);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

const clients = await sql`
  SELECT id, company_name, manager, business_no, status, phone
  FROM clients
`;

const byBiz = new Map();
const byNameManager = new Map();
for (const c of clients) {
  const biz = normBizNo(c.business_no);
  if (biz) byBiz.set(biz, c);
  const key = `${c.company_name.trim()}||${c.manager.trim()}`;
  if (!byNameManager.has(key)) byNameManager.set(key, c);
}

let matched = 0;
let skipped = 0;
let upserted = 0;
const primarySet = new Set();

for (const row of rows) {
  const companyName = String(row['상호'] ?? '').trim();
  const businessNo = normBizNo(row['사업자등록번호']);
  const manager = String(row['담당'] ?? '').trim();
  const contactRaw = String(row['연락처'] ?? '').trim();
  const contactKind = String(row['연락처구분'] ?? '').trim();
  const nameRaw = String(row['이름'] ?? '').trim();

  if (!companyName || !contactRaw) {
    skipped++;
    continue;
  }

  let client =
    (businessNo && byBiz.get(businessNo)) ||
    byNameManager.get(`${companyName}||${manager}`) ||
    byNameManager.get(`${companyName}||`);

  if (!client) {
    skipped++;
    continue;
  }

  matched++;
  const { name, role } = parseNameRole(nameRaw);
  const { phone, mobilePhone } = splitPhone(contactRaw);
  const excelKey = `${companyName}||${businessNo}||${nameRaw}||${contactRaw}`;
  const isPrimary = role === '대표' && !primarySet.has(client.id);
  if (isPrimary) primarySet.add(client.id);

  await sql`
    INSERT INTO client_contacts (
      client_id, name, role, phone, mobile_phone, contact_kind, is_primary, source, excel_key
    ) VALUES (
      ${client.id}, ${name || nameRaw}, ${role}, ${phone}, ${mobilePhone}, ${contactKind},
      ${isPrimary}, 'douzone_contact_export', ${excelKey}
    )
    ON CONFLICT (excel_key) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      phone = EXCLUDED.phone,
      mobile_phone = EXCLUDED.mobile_phone,
      contact_kind = EXCLUDED.contact_kind,
      is_primary = EXCLUDED.is_primary,
      updated_at = NOW()
  `;
  upserted++;

  // active 수임처 phone 보강 (intake/churned 제외, phone 비어있을 때만)
  if (client.status === 'active' && isPrimary && !client.phone?.trim()) {
    const mainPhone = mobilePhone || phone;
    if (mainPhone) {
      await sql`UPDATE clients SET phone = ${mainPhone}, updated_at = NOW() WHERE id = ${client.id}`;
      client.phone = mainPhone;
    }
  }
}

await sql.end();
console.log(`✓ 매칭 ${matched}건, upsert ${upserted}건, 스킵 ${skipped}건`);
