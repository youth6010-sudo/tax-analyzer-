/**
 * 오프라인·하나비 — 원장과 불일치하는 수동 잔액 + 엑셀 공문 내역 복구
 * Usage: node scripts/fix-offline-hanabi-balances.mjs
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
  if (/[*×xX]/.test(s) && /\d/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
  }
  return s;
}

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const joined = (rows[i] ?? []).map(c => cellStr(c).replace(/\s+/g, '')).join('|');
    if (joined.includes('내역') && joined.includes('금액')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { lines: [], letterDate: '' };

  let letterDate = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? [];
    for (let c = row.length - 1; c >= 0; c--) {
      const s = cellStr(row[c]);
      if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) {
        letterDate = s;
        break;
      }
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        letterDate = `${m[1]}.${m[2]}.${m[3]}`;
        break;
      }
    }
    if (letterDate) break;
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
  return { lines, letterDate: letterDate || '2026.07.27' };
}

/** @see lib/arrearsBalanceLock.ts */
const TARGETS = [
  { code: '00183', name: '오프라인', balance: 0 },
  { code: '00199', name: '하나비', balance: 207_301 },
];

const xlsPath = path.join('z:', '10_미수관리', '미수금 공문 - 26년', '미수수수료-인디-26.07.27.xls');
if (!fs.existsSync(xlsPath)) {
  console.error('원본 없음:', xlsPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsPath, { cellDates: true });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

for (const t of TARGETS) {
  const ws = wb.Sheets[t.name];
  if (!ws) {
    console.error('시트 없음:', t.name);
    continue;
  }
  const parsed = parseSheet(ws);
  console.log(`\n=== ${t.name} (${t.code}) lines=${parsed.lines.length} ===`);

  const [entry] = await sql`
    SELECT id, company_name, balance FROM arrears_entries
    WHERE external_code = ${t.code} OR company_name = ${t.name}
    LIMIT 1
  `;
  if (!entry) {
    console.error('DB 없음:', t.name);
    continue;
  }

  await sql`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${entry.id}`;
  for (let i = 0; i < parsed.lines.length; i++) {
    const l = parsed.lines[i];
    await sql`
      INSERT INTO arrears_letter_lines (
        arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
      ) VALUES (
        ${entry.id}, ${i}, ${l.description}, ${l.amount}, ${l.paidAmount}, ${l.paidDate}, 'letter'
      )
    `;
  }
  const asOf = parsed.letterDate.replace(/\./g, '-');
  await sql`
    UPDATE arrears_entries SET
      balance = ${t.balance},
      carry_in = ${t.balance},
      debit = 0,
      credit = 0,
      letter_date = ${parsed.letterDate},
      as_of_date = ${asOf},
      source = 'letter',
      updated_by = 'fix-offline-hanabi-balances',
      updated_at = now()
    WHERE id = ${entry.id}
  `;
  console.log(`OK ${t.name}: balance=${t.balance} lines=${parsed.lines.length}`);
}

await sql.end({ timeout: 5 });
