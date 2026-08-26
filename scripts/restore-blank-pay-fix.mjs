/**
 * 빈상호(00000)로 잘못 들어간 공문 4건을 올바른 업체로 재복구
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

function parseSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const joined = (rows[i] ?? []).map(c => cellStr(c).replace(/\s+/g, '')).join('|');
    if (joined.includes('내역') && (joined.includes('금액') || joined.includes('vat'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error(`header missing: ${sheetName}`);
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
  let letterDate = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    for (const c of rows[i] ?? []) {
      const s = cellStr(c);
      if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) letterDate = s;
    }
  }

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = cellStr(row[iDesc]);
    let amount = cellMoney(row[iAmt]);
    const paidAmount = cellMoney(row[iPay]);
    const paidDate = formatPaidDateKo(row[iDate]);
    const balCell = cellMoney(row[iBal]);
    const compact = desc.replace(/\s+/g, '');
    if (compact === '미수수수료') break;
    if (compact === '총액' || compact.startsWith('총액') || compact === '합계') continue;
    if (amount === 0 && paidAmount === 0 && balCell !== 0 && /이월/.test(compact)) amount = balCell;
    if (!desc && !amount && !paidAmount && !paidDate) continue;
    if (!desc && !amount && !paidAmount) continue;
    lines.push({ description: desc, amount, paidAmount, paidDate });
  }
  return { letterDate, lines, balance: lines.reduce((s, l) => s + l.amount - l.paidAmount, 0) };
}

async function applyToEntry(sql, entryId, parsed, label) {
  await sql`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${entryId}`;
  for (let i = 0; i < parsed.lines.length; i++) {
    const l = parsed.lines[i];
    await sql`
      INSERT INTO arrears_letter_lines (
        arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
      ) VALUES (
        ${entryId}, ${i}, ${l.description}, ${l.amount}, ${l.paidAmount}, ${l.paidDate}, 'letter'
      )
    `;
  }
  await sql`
    UPDATE arrears_entries SET
      letter_date = ${parsed.letterDate || ''},
      balance = ${parsed.balance},
      updated_by = 'restore-blank-pay-fix',
      updated_at = now()
    WHERE id = ${entryId}
  `;
  console.log(`✓ ${label}: ${parsed.lines.length}줄, 잔액 ${parsed.balance}`);
}

const dir = path.join('z:', '10_미수관리', '미수금 공문 - 26년');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const jobs = [
  {
    file: '미수수수료-인디-26.07.27.xls',
    sheet: '티밸류홀딩스',
    entryId: '7889d343-46d9-45e8-8143-08e909482918',
    label: '(주)티밸류홀딩스',
  },
  {
    file: '미수수수료_다야-26.07.27.xls',
    sheet: '(주)팀코리아',
    entryId: '873141ff-8b70-4ed9-804b-615c9d655820',
    label: '주식회사 팀코리아(광주)',
  },
  {
    file: '미수수수료_다야-26.07.27.xls',
    sheet: '천돈가-이주영',
    entryId: 'a16988df-d5cf-4818-a16b-c4a8db68c2f7',
    label: '천돈가',
  },
  {
    file: '미수수수료_윈터-26.07.27.xls',
    sheet: '보은이앤지',
    entryId: null, // create or reuse empty
    label: '보은이앤지',
  },
];

for (const job of jobs) {
  const wb = XLSX.readFile(path.join(dir, job.file), { cellDates: true });
  const ws = wb.Sheets[job.sheet];
  if (!ws) throw new Error(`sheet missing ${job.sheet}`);
  const parsed = parseSheet(ws, job.sheet);

  let entryId = job.entryId;
  if (!entryId) {
    // 보은이앤지: 빈 00000 행을 이 업체로 전환
    const [empty] = await sql`
      SELECT id FROM arrears_entries WHERE external_code = '00000' LIMIT 1
    `;
    if (!empty) throw new Error('00000 entry missing');
    entryId = empty.id;
    await sql`
      UPDATE arrears_entries SET
        company_name = '보은이앤지',
        manager_name = '윈터',
        source = 'letter'
      WHERE id = ${entryId}
    `;
  }

  await applyToEntry(sql, entryId, parsed, job.label);
}

// 00000이 보은이앤지로 바뀌었는지 확인. 남아 있으면 라인 비우기
const leftover = await sql`
  SELECT id, company_name, external_code, balance,
    (SELECT count(*)::int FROM arrears_letter_lines l WHERE l.arrears_entry_id = e.id) n
  FROM arrears_entries e
  WHERE external_code = '00000' OR company_name = ''
`;
console.log('empty leftovers', leftover);

await sql.end({ timeout: 5 });
