/**
 * 담당자별 미수수수료.xls → arrears_letter_lines 이관
 *
 * Usage:
 *   node scripts/import-arrears-letter-lines.mjs
 *   node scripts/import-arrears-letter-lines.mjs "z:/10_미수관리/미수금 공문 - 26년"
 *   node scripts/import-arrears-letter-lines.mjs path/to/미수수수료_다야-26.07.27.xls
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import XLSX from 'xlsx';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function cellStr(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function looksLikeHeader(row) {
  const cells = (row ?? []).map(c => cellStr(c).replace(/\s+/g, ''));
  const joined = cells.join('|');
  return joined.includes('내역') && (joined.includes('금액') || joined.includes('vat'));
}

function isTotalRow(desc) {
  const d = desc.replace(/\s+/g, '');
  return d === '총액' || d.startsWith('총액') || d === '합계' || d === '미수수수료';
}

function extractLetterDate(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? [];
    for (let c = row.length - 1; c >= 0; c--) {
      const s = cellStr(row[c]);
      if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    }
  }
  return '';
}

function parseSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (looksLikeHeader(rows[i] ?? [])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return null;

  const header = (rows[headerIdx] ?? []).map(c => cellStr(c).replace(/\s+/g, ''));
  let iDesc = header.findIndex(h => h.includes('내역'));
  let iAmt = header.findIndex(h => h.includes('금액'));
  let iPay = header.findIndex(h => h.includes('지급내역') || h === '지급');
  let iDate = header.findIndex(h => h.includes('지급일시') || h.includes('일시'));
  if (iDesc < 0) iDesc = 1;
  if (iAmt < 0) iAmt = iDesc + 1;
  if (iPay < 0) iPay = iAmt + 1;
  if (iDate < 0) iDate = iPay + 1;

  const lines = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = cellStr(row[iDesc]);
    if (!desc) continue;
    const compact = desc.replace(/\s+/g, '');
    if (compact === '미수수수료') break;
    if (isTotalRow(desc)) continue;
    lines.push({
      description: desc,
      amount: cellMoney(row[iAmt]),
      paidAmount: cellMoney(row[iPay]),
      paidDate: cellStr(row[iDate]),
    });
  }
  if (!lines.length) return null;
  return {
    companyName: cellStr(sheetName),
    letterDate: extractLetterDate(rows),
    lines,
  };
}

function managerFromFilename(name) {
  for (const key of ['인디', '다야', '리아', '블루', '윈터', '페리']) {
    if (name.includes(key)) return key;
  }
  return '';
}

function normName(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[＆&]/g, '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사/g, '(유)')
    .replace(/[()（）·・./\-]/g, '')
    .toLowerCase();
}

function softKey(s) {
  return normName(s).replace(/원/g, '');
}

function findByName(entries, sheetName) {
  const key = normName(sheetName);
  const soft = softKey(sheetName);
  const byName = new Map(entries.map(e => [normName(e.company_name), e]));
  const bySoft = new Map(entries.map(e => [softKey(e.company_name), e]));
  let hit = byName.get(key) || bySoft.get(soft);
  if (hit) return hit;
  for (const [nk, row] of byName) {
    if (nk.includes(key) || key.includes(nk)) return row;
  }
  for (const [sk, row] of bySoft) {
    if (sk.includes(soft) || soft.includes(sk)) return row;
  }
  return null;
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const arg = process.argv[2];
const defaultDir = path.join('z:', '10_미수관리', '미수금 공문 - 26년');
const target = arg || defaultDir;

if (!fs.existsSync(target)) {
  console.error('경로 없음:', target);
  process.exit(1);
}

const files = [];
const st = fs.statSync(target);
if (st.isDirectory()) {
  for (const f of fs.readdirSync(target)) {
    if (!/\.xls[x]?$/i.test(f)) continue;
    if (!/미수수수료/.test(f) || f.includes('현황')) continue;
    if (!managerFromFilename(f)) continue;
    files.push(path.join(target, f));
  }
} else {
  files.push(target);
}

if (!files.length) {
  console.error('공문 xls 없음');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

// ensure migration
const mig = path.join(root, 'drizzle', '0018_arrears_letter_lines.sql');
if (fs.existsSync(mig)) {
  await sql.unsafe(fs.readFileSync(mig, 'utf8'));
}

const entries = await sql`
  SELECT id, company_name, external_code, manager_name, balance
  FROM arrears_entries
`;

let updated = 0;
let skipped = 0;
let totalLines = 0;

for (const filePath of files) {
  const base = path.basename(filePath);
  const managerName = managerFromFilename(base);
  console.log('파일:', base, '담당:', managerName || '(미상)');
  const wb = XLSX.readFile(filePath, { cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const parsed = parseSheet(wb.Sheets[sheetName], sheetName);
    if (!parsed) {
      console.log('  skip sheet (형식 아님):', sheetName);
      continue;
    }
    const hit = findByName(entries, parsed.companyName);
    if (!hit) {
      console.log('  unmatched:', parsed.companyName, `(${parsed.lines.length}줄)`);
      skipped += 1;
      continue;
    }

    await sql`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${hit.id}`;
    const letterBal = parsed.lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
    for (let i = 0; i < parsed.lines.length; i++) {
      const l = parsed.lines[i];
      await sql`
        INSERT INTO arrears_letter_lines (
          arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
        ) VALUES (
          ${hit.id}, ${i}, ${l.description}, ${l.amount}, ${l.paidAmount}, ${l.paidDate}, 'letter'
        )
      `;
    }
    await sql`
      UPDATE arrears_entries SET
        letter_date = ${parsed.letterDate || ''},
        balance = ${letterBal},
        manager_name = CASE
          WHEN manager_name = '' AND ${managerName} <> '' THEN ${managerName}
          ELSE manager_name
        END,
        updated_by = 'letter_lines_import',
        updated_at = now()
      WHERE id = ${hit.id}
    `;
    totalLines += parsed.lines.length;
    updated += 1;
    console.log(
      `  ✓ ${parsed.companyName} → ${hit.company_name} (${parsed.lines.length}줄, 잔액 ${letterBal})`,
    );
  }
}

console.log(`완료: 반영 ${updated}, 미매칭 ${skipped}, 라인 ${totalLines}`);
await sql.end({ timeout: 5 });
