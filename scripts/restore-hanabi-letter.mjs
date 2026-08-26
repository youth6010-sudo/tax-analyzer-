/**
 * 하나비 공문 내역 복구 — 8/4 임포트가 내역 빈 지급행을 건너뛴 버그 보정
 * Usage: node scripts/restore-hanabi-letter.mjs
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
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function formatPaidDateKo(raw) {
  const s = cellStr(raw);
  if (!s) return '';
  if (/[*×xX]/.test(s) && /\d/.test(s)) return s; // 110,000*36 메모
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
  }
  return s;
}

const xlsPath = path.join('z:', '10_미수관리', '미수금 공문 - 26년', '미수수수료-인디-26.07.27.xls');
if (!fs.existsSync(xlsPath)) {
  console.error('원본 없음:', xlsPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsPath, { cellDates: true });
const ws = wb.Sheets['하나비'];
if (!ws) {
  console.error('시트 없음: 하나비');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
let headerIdx = -1;
for (let i = 0; i < Math.min(rows.length, 40); i++) {
  const joined = (rows[i] ?? []).map(c => cellStr(c).replace(/\s+/g, '')).join('|');
  if (joined.includes('내역') && joined.includes('금액')) {
    headerIdx = i;
    break;
  }
}

const lines = [];
for (let r = headerIdx + 1; r < rows.length; r++) {
  const row = rows[r] ?? [];
  const desc = cellStr(row[1]);
  const amount = cellMoney(row[2]);
  const paidAmount = cellMoney(row[3]);
  const paidDate = formatPaidDateKo(row[4]);
  const compact = desc.replace(/\s+/g, '');
  if (compact === '미수수수료') break;
  if (compact === '총액' || compact.startsWith('총액') || compact === '합계') continue;
  if (!desc && !amount && !paidAmount) continue;
  lines.push({ description: desc, amount, paidAmount, paidDate });
}

const letterBal = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
console.log(`parsed ${lines.length} lines, balance ${letterBal}`);
for (const l of lines) {
  console.log(`  ${l.description || '(지급)'}\t${l.amount}\t${l.paidAmount}\t${l.paidDate}`);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [entry] = await sql`
  SELECT id, company_name, balance FROM arrears_entries WHERE company_name = '하나비' LIMIT 1
`;
if (!entry) {
  console.error('DB에 하나비 없음');
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${entry.id}`;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  await sql`
    INSERT INTO arrears_letter_lines (
      arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
    ) VALUES (
      ${entry.id}, ${i}, ${l.description}, ${l.amount}, ${l.paidAmount}, ${l.paidDate}, 'letter'
    )
  `;
}
await sql`
  UPDATE arrears_entries SET
    balance = ${letterBal},
    letter_date = '2026.07.27',
    as_of_date = '2026-07-27',
    updated_by = 'restore-hanabi-letter',
    updated_at = now()
  WHERE id = ${entry.id}
`;

const verify = await sql`
  SELECT count(*)::int AS n,
    coalesce(sum(amount - paid_amount), 0)::int AS open
  FROM arrears_letter_lines WHERE arrears_entry_id = ${entry.id}
`;
console.log(`restored ${entry.company_name}: lines=${verify[0].n} open=${verify[0].open} (was bal=${entry.balance})`);
await sql.end({ timeout: 5 });
