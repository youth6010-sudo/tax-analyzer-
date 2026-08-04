/**
 * 세무사랑 거래처원장.xls → arrears_entries 잔액·사업자번호 upsert
 * - 원장에 있는 코드만 갱신/추가 (담당·관리분류·메모는 유지)
 * - 원장에 없는 DB 행(현황·공문 등)은 삭제·변경하지 않음
 *
 * Usage: node scripts/import-arrears-ledger.mjs [xls경로]
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
function normalizeHeader(h) {
  return String(h ?? '').replace(/\s+/g, '').trim();
}
function asOfFromName(filename) {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const file =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Desktop', '거래처원장_20260803_151508 미수.xls');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error('파일 없음:', file);
  process.exit(1);
}

const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
let headerIdx = -1;
for (let i = 0; i < Math.min(rows.length, 20); i++) {
  const joined = (rows[i] || []).map(normalizeHeader).join('|');
  if (joined.includes('코드') && joined.includes('거래처')) {
    headerIdx = i;
    break;
  }
}
if (headerIdx < 0) {
  console.error('헤더를 찾지 못했습니다.');
  process.exit(1);
}
const headers = (rows[headerIdx] || []).map(normalizeHeader);
const idx = (...cands) => {
  for (const c of cands) {
    const i = headers.findIndex(h => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
};
const iCode = idx('코드');
const iName = idx('거래처', '거래처명');
const iBiz = idx('등록번호');
const iRep = idx('대표자명', '대표자');
const iCarry = idx('전기이월');
const iDebit = idx('차변');
const iCredit = idx('대변');
const iBal = idx('잔액');

const parsed = [];
for (let r = headerIdx + 1; r < rows.length; r++) {
  const row = rows[r] || [];
  const code = cellStr(row[iCode]);
  const name = cellStr(row[iName]);
  if (!code && !name) continue;
  if (!/^\d{3,}$/.test(code)) continue;
  parsed.push({
    code,
    name,
    biz: cellStr(row[iBiz]).replace(/\D/g, ''),
    rep: iRep >= 0 ? cellStr(row[iRep]) : '',
    carry: iCarry >= 0 ? cellMoney(row[iCarry]) : 0,
    debit: iDebit >= 0 ? cellMoney(row[iDebit]) : 0,
    credit: iCredit >= 0 ? cellMoney(row[iCredit]) : 0,
    bal: iBal >= 0 ? cellMoney(row[iBal]) : 0,
  });
}

const asOf = asOfFromName(path.basename(file));
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
let updated = 0;
let inserted = 0;
try {
  const beforeCodes = await sql`select external_code from arrears_entries`;
  const ledgerCodeSet = new Set(parsed.map(r => r.code));
  const preserved = beforeCodes.filter(r => !ledgerCodeSet.has(r.external_code)).length;

  const CHUNK = 40;
  for (let i = 0; i < parsed.length; i += CHUNK) {
    const chunk = parsed.slice(i, i + CHUNK);
    await sql.begin(async tx => {
      for (const r of chunk) {
        const result = await tx`
          insert into arrears_entries (
            external_code, company_name, business_no, representative,
            balance, carry_in, debit, credit, as_of_date, source, updated_by
          ) values (
            ${r.code}, ${r.name}, ${r.biz}, ${r.rep},
            ${r.bal}, ${r.carry}, ${r.debit}, ${r.credit}, ${asOf}, 'ledger', 'ledger-import'
          )
          on conflict (external_code) do update set
            company_name = case
              when excluded.company_name <> '' then excluded.company_name
              else arrears_entries.company_name
            end,
            business_no = case
              when excluded.business_no <> '' then excluded.business_no
              else arrears_entries.business_no
            end,
            representative = case
              when excluded.representative <> '' then excluded.representative
              else arrears_entries.representative
            end,
            balance = excluded.balance,
            carry_in = excluded.carry_in,
            debit = excluded.debit,
            credit = excluded.credit,
            as_of_date = excluded.as_of_date,
            source = 'ledger',
            updated_by = 'ledger-import',
            updated_at = now()
          returning (xmax = 0) as is_insert
        `;
        if (result[0]?.is_insert) inserted += 1;
        else updated += 1;
      }
    });
    process.stdout.write(`\r  progress ${Math.min(i + CHUNK, parsed.length)}/${parsed.length}`);
  }
  process.stdout.write('\n');

  const stats = await sql`
    select
      count(*)::int as total,
      count(*) filter (where balance <> 0)::int as nonzero,
      count(*) filter (where balance > 0)::int as pos,
      count(*) filter (where balance < 0)::int as neg,
      coalesce(sum(balance), 0)::bigint as sum_bal,
      count(*) filter (where source not in ('ledger', 'manual'))::int as non_ledger
    from arrears_entries
  `;
  console.log(`파일: ${path.basename(file)} / 기준일 ${asOf}`);
  console.log(
    `파싱 ${parsed.length} · 갱신 ${updated} · 신규 ${inserted} · 원장 밖 유지 ${preserved}`,
  );
  console.log(
    `db total=${stats[0].total} nonzero=${stats[0].nonzero} (+${stats[0].pos}/-${stats[0].neg}) sum=${stats[0].sum_bal} non_ledger_source=${stats[0].non_ledger}`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
