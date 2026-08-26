/**
 * 8/4 임포트 버그 복구 — 내역 빈 지급행이 빠진 공문 시트 전부 재반영
 * Usage: node scripts/restore-blank-pay-letters.mjs
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

function looksLikeHeader(row) {
  const joined = (row ?? []).map(c => cellStr(c).replace(/\s+/g, '')).join('|');
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
  let iBal = header.findIndex(h => h.includes('잔액'));
  if (iDesc < 0) iDesc = 1;
  if (iAmt < 0) iAmt = iDesc + 1;
  if (iPay < 0) iPay = iAmt + 1;
  if (iDate < 0) iDate = iPay + 1;
  if (iBal < 0) iBal = iDate + 1;

  const lines = [];
  let blankPay = 0;
  let withDesc = 0;
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = cellStr(row[iDesc]);
    let amount = cellMoney(row[iAmt]);
    const paidAmount = cellMoney(row[iPay]);
    const paidDate = formatPaidDateKo(row[iDate]);
    const balCell = cellMoney(row[iBal]);
    const compact = desc.replace(/\s+/g, '');

    if (compact === '미수수수료') break;
    if (desc && isTotalRow(desc)) continue;

    if (amount === 0 && paidAmount === 0 && balCell !== 0 && /이월/.test(compact)) {
      amount = balCell;
    }

    if (!desc && !amount && !paidAmount && !paidDate) continue;
    if (!desc && !amount && !paidAmount) continue;

    if (!desc && (amount || paidAmount)) blankPay += 1;
    if (desc) withDesc += 1;

    lines.push({ description: desc, amount, paidAmount, paidDate });
  }
  if (!lines.length || blankPay === 0) return null;
  return {
    companyName: cellStr(sheetName),
    letterDate: extractLetterDate(rows),
    lines,
    blankPay,
    withDesc,
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
  // 빈 상호·더미코드는 매칭 대상에서 제외
  const usable = entries.filter(
    e => String(e.company_name || '').trim() && String(e.external_code || '') !== '00000',
  );
  const key = normName(sheetName);
  const soft = softKey(sheetName);
  const byName = new Map(usable.map(e => [normName(e.company_name), e]));
  const bySoft = new Map(usable.map(e => [softKey(e.company_name), e]));
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

const dir = path.join('z:', '10_미수관리', '미수금 공문 - 26년');
const files = fs
  .readdirSync(dir)
  .filter(f => /\.xls[x]?$/i.test(f) && /미수수수료/.test(f) && !f.includes('현황') && /26\.07\.27/.test(f))
  .map(f => path.join(dir, f));

if (!files.length) {
  console.error('26.07.27 공문 xls 없음');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const entries = await sql`
  SELECT id, company_name, external_code, manager_name, balance
  FROM arrears_entries
`;

let updated = 0;
let skipped = 0;
let unmatched = 0;

for (const filePath of files) {
  const base = path.basename(filePath);
  const managerName = managerFromFilename(base);
  console.log(`\n파일: ${base}`);
  const wb = XLSX.readFile(filePath, { cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const parsed = parseSheet(wb.Sheets[sheetName], sheetName);
    if (!parsed) continue;

    const hit = findByName(entries, parsed.companyName);
    if (!hit) {
      console.log(`  ✗ 미매칭: ${parsed.companyName} (지급행 ${parsed.blankPay})`);
      unmatched += 1;
      continue;
    }

    const before = await sql`
      SELECT count(*)::int AS n,
        coalesce(sum(amount - paid_amount), 0)::int AS open
      FROM arrears_letter_lines
      WHERE arrears_entry_id = ${hit.id}
    `;
    const letterBal = parsed.lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);

    // 이미 완전한 경우(줄 수·잔액 동일) 스킵
    if (before[0].n === parsed.lines.length && before[0].open === letterBal) {
      console.log(
        `  · 유지: ${hit.company_name} (${parsed.lines.length}줄, 잔액 ${letterBal})`,
      );
      skipped += 1;
      continue;
    }

    await sql`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${hit.id}`;
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
        updated_by = 'restore-blank-pay-letters',
        updated_at = now()
      WHERE id = ${hit.id}
    `;

    console.log(
      `  ✓ ${parsed.companyName} → ${hit.company_name}: ${before[0].n}→${parsed.lines.length}줄, ` +
        `잔액 ${hit.balance}→${letterBal} (지급행 +${parsed.blankPay})`,
    );
    updated += 1;
  }
}

console.log(`\n완료: 복구 ${updated}, 이미완전 ${skipped}, 미매칭 ${unmatched}`);
await sql.end({ timeout: 5 });
