/**
 * 미수금 공문 폴더 현황표 + 담당자별 미수수수료.xls → arrears_entries 반영
 * (거래처원장 아님 — 잔액·담당·관리분류 기준)
 *
 * Usage:
 *   node scripts/import-arrears-gongmun.mjs
 *   node scripts/import-arrears-gongmun.mjs "z:/10_미수관리/미수금 공문 - 26년"
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

const MANAGER_MAP = {
  1: '인디',
  2: '블루',
  3: '다야',
  4: '윈터',
  5: '리아',
  6: '페리',
};

const CATEGORY_MAP = {
  0: 'recovery',
  1: 'bad',
  2: 'long',
  3: 'temp',
  4: 'cms',
};

function parseMgmtCategory(raw) {
  // 빈 칸을 Number('')→0→채권회수로 오인하지 않도록
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return CATEGORY_MAP[raw] ?? '';
  }
  const s = cellStr(raw);
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return CATEGORY_MAP[n] ?? '';
}

const MANAGER_FROM_FILENAME = [
  ['인디', '인디'],
  ['다야', '다야'],
  ['리아', '리아'],
  ['블루', '블루'],
  ['윈터', '윈터'],
  ['페리', '페리'],
];

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

function normHeader(h) {
  return String(h ?? '')
    .replace(/\s+/g, '')
    .trim();
}

function normName(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[＆&]/g, '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사/g, '(유)')
    .replace(/메거진/g, '매거진')
    .replace(/이앤지/g, '이엔지')
    .replace(/[()（）·・./\-]/g, '')
    .toLowerCase();
}

/** 공문 시트명 ↔ 현황 상호 느슨 매칭용 */
function softKey(s) {
  return normName(s).replace(/원/g, '');
}

function findByCompanyName(byName, bySoft, sheetName) {
  const key = normName(sheetName);
  let hit = byName.get(key);
  if (hit) return hit;
  const soft = softKey(sheetName);
  hit = bySoft.get(soft);
  if (hit) return hit;
  for (const [nk, row] of byName) {
    if (nk.includes(key) || key.includes(nk)) return row;
  }
  for (const [sk, row] of bySoft) {
    if (sk.includes(soft) || soft.includes(sk)) return row;
  }
  return null;
}

function sheetDateToIso(sheetName) {
  const m = String(sheetName).match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return '';
  const yy = Number(m[1]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${year}-${m[2]}-${m[3]}`;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(normHeader);
    const joined = cells.join('|');
    if (joined.includes('코드') && (joined.includes('거래처명') || joined.includes('거래처'))) {
      return i;
    }
  }
  return -1;
}

function colIndexes(headers, label) {
  const out = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === label || headers[i].includes(label)) out.push(i);
  }
  return out;
}

function colIndex(headers, ...cands) {
  for (const c of cands) {
    const i = headers.findIndex(h => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function managerFromFilename(name) {
  for (const [key, nick] of MANAGER_FROM_FILENAME) {
    if (name.includes(key)) return nick;
  }
  return '';
}

const dir =
  process.argv[2] || path.join('z:', '10_미수관리', '미수금 공문 - 26년');

if (!fs.existsSync(dir)) {
  console.error('폴더 없음:', dir);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => /\.xls[x]?$/i.test(f));
const statusFile = files.find(f => f.includes('현황') && f.includes('26.07.27'))
  || files.find(f => f.includes('현황'));
const letterFiles = files.filter(
  f => /미수수수료/.test(f) && !f.includes('현황') && managerFromFilename(f),
);

if (!statusFile) {
  console.error('현황.xls를 찾지 못했습니다.', files);
  process.exit(1);
}

console.log('현황:', statusFile);
console.log('공문:', letterFiles.join(', '));

// ---- 현황 파싱 ----
const statusPath = path.join(dir, statusFile);
const wb = XLSX.readFile(statusPath);
const lastSheet = wb.SheetNames[wb.SheetNames.length - 1];
const asOfDate = sheetDateToIso(lastSheet) || '2026-07-27';
const rows = XLSX.utils.sheet_to_json(wb.Sheets[lastSheet], {
  header: 1,
  defval: '',
  raw: true,
});
const headerIdx = findHeaderRow(rows);
if (headerIdx < 0) {
  console.error('현황 헤더를 찾지 못함 sheet=', lastSheet);
  process.exit(1);
}
const headers = (rows[headerIdx] ?? []).map(normHeader);
const iCode = colIndex(headers, '코드');
const iName = colIndex(headers, '거래처명', '거래처');
const iCarry = colIndex(headers, '전기');
const debitCols = colIndexes(headers, '차변');
const creditCols = colIndexes(headers, '대변');
const balCols = colIndexes(headers, '잔액');
const iMgr = colIndex(headers, '담당');
const iCms = colIndex(headers, 'CMS');
const iMgmt = colIndex(headers, '관리');
const iPast = colIndex(headers, '과거일정');

const byCode = new Map();
for (let r = headerIdx + 1; r < rows.length; r++) {
  const row = rows[r] ?? [];
  const code = cellStr(row[iCode]);
  const companyName = cellStr(row[iName]);
  if (!/^\d{3,}$/.test(code) || !companyName || /합계|총계/.test(companyName)) continue;

  const mgrRaw = row[iMgr];
  const mgrCode = typeof mgrRaw === 'number' ? mgrRaw : Number(cellStr(mgrRaw));
  const managerName = MANAGER_MAP[mgrCode] || '';

  const mgmtRaw = iMgmt >= 0 ? row[iMgmt] : '';
  const mgmtCategory = parseMgmtCategory(mgmtRaw);

  const balance = balCols.length ? cellMoney(row[balCols[0]]) : 0;
  const carryIn = iCarry >= 0 ? cellMoney(row[iCarry]) : 0;
  const debit = debitCols.length ? cellMoney(row[debitCols[0]]) : 0;
  const credit = creditCols.length ? cellMoney(row[creditCols[0]]) : 0;
  const cmsNote = iCms >= 0 ? cellStr(row[iCms]) : '';
  const memo = iPast >= 0 ? cellStr(row[iPast]) : '';

  byCode.set(code, {
    code,
    companyName,
    managerName,
    mgmtCategory,
    balance,
    carryIn,
    debit,
    credit,
    cmsNote,
    memo,
    source: 'status',
  });
}

console.log(`현황 sheet=${lastSheet} asOf=${asOfDate} unique=${byCode.size}`);

// ---- 공문 파싱 → 잔액/담당 보강 (상호 매칭) ----
const byName = new Map();
const bySoft = new Map();
for (const row of byCode.values()) {
  byName.set(normName(row.companyName), row);
  bySoft.set(softKey(row.companyName), row);
}

let letterHits = 0;
let letterMiss = 0;
for (const lf of letterFiles) {
  const mgr = managerFromFilename(lf);
  const lwb = XLSX.readFile(path.join(dir, lf));
  for (const sheetName of lwb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(lwb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    });
    let letterBal = null;
    for (const row of sheetRows) {
      const label = normHeader(row[1] ?? row[0] ?? '');
      if (label.includes('미수수수료') && !label.includes('안내')) {
        const amt = cellMoney(row[5] ?? row[4] ?? row[3]);
        if (amt !== 0 || cellStr(row[5]) !== '') letterBal = amt;
      }
    }
    if (letterBal == null) continue;

    const hit = findByCompanyName(byName, bySoft, sheetName);
    if (!hit) {
      letterMiss += 1;
      console.log(`  미매칭 공문: [${mgr}] ${sheetName} → ${letterBal}`);
      continue;
    }
    hit.balance = letterBal;
    if (mgr) hit.managerName = mgr;
    hit.source = 'letter';
    letterHits += 1;
  }
}
console.log(`공문 잔액 반영 ${letterHits} · 미매칭 ${letterMiss}`);

const list = [...byCode.values()];
const nonzero = list.filter(r => r.balance !== 0).length;
console.log(`반영 예정 ${list.length}건 (잔액≠0 ${nonzero})`);

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  let inserted = 0;
  let updated = 0;
  const CHUNK = 40;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    await sql.begin(async tx => {
      for (const row of chunk) {
        const result = await tx`
          INSERT INTO arrears_entries (
            external_code, company_name, business_no, representative,
            balance, carry_in, debit, credit,
            manager_name, mgmt_category, cms_note, memo,
            as_of_date, source, updated_by
          ) VALUES (
            ${row.code}, ${row.companyName}, ${''}, ${''},
            ${row.balance}, ${row.carryIn}, ${row.debit}, ${row.credit},
            ${row.managerName}, ${row.mgmtCategory}, ${row.cmsNote}, ${row.memo},
            ${asOfDate}, ${row.source}, ${'gongmun-import'}
          )
          ON CONFLICT (external_code) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            balance = EXCLUDED.balance,
            carry_in = EXCLUDED.carry_in,
            debit = EXCLUDED.debit,
            credit = EXCLUDED.credit,
            manager_name = CASE
              WHEN EXCLUDED.manager_name <> '' THEN EXCLUDED.manager_name
              ELSE arrears_entries.manager_name
            END,
            mgmt_category = EXCLUDED.mgmt_category,
            cms_note = CASE
              WHEN EXCLUDED.cms_note <> '' THEN EXCLUDED.cms_note
              ELSE arrears_entries.cms_note
            END,
            memo = CASE
              WHEN EXCLUDED.memo <> '' THEN EXCLUDED.memo
              ELSE arrears_entries.memo
            END,
            as_of_date = EXCLUDED.as_of_date,
            source = EXCLUDED.source,
            updated_by = ${'gongmun-import'},
            updated_at = now()
          RETURNING (xmax = 0) AS is_insert
        `;
        if (result[0]?.is_insert) inserted += 1;
        else updated += 1;
      }
    });
    process.stdout.write(`\r  progress ${Math.min(i + CHUNK, list.length)}/${list.length}`);
  }
  process.stdout.write('\n');

  const stats = await sql`
    select
      count(*)::int as total,
      count(*) filter (where balance <> 0)::int as nonzero,
      coalesce(sum(balance),0)::bigint as sum_bal
    from arrears_entries
  `;
  console.log(
    `✓ inserted=${inserted} updated=${updated} db total=${stats[0].total} nonzero=${stats[0].nonzero} sum=${stats[0].sum_bal}`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
