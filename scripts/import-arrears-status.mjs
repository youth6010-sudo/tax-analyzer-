/**
 * 현황표(미수수수료 거래처(잔액)현황_*.xls) 마지막 시트에서
 * 담당·관리분류·메모를 arrears_entries에 보강합니다. (1회 이관)
 *
 * 사용:
 *   node scripts/import-arrears-status.mjs [xls경로]
 *   npm run db:import-arrears-status -- "z:/10_미수관리/.../현황.xls"
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

function cellStr(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** 엑셀 일련일 → YY.MM.DD 또는 원문 */
function cellMemoPart(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    // Excel 1900 date system
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(v) * 86400000);
    if (!Number.isNaN(d.getTime())) {
      const yy = String(d.getUTCFullYear()).slice(2);
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yy}.${mm}.${dd}`;
    }
  }
  return cellStr(v);
}

function buildMemo(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const s = cellMemoPart(p);
    if (!s || s === '-') continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.join(' · ');
}

function normHeader(h) {
  return String(h ?? '')
    .replace(/\s+/g, '')
    .trim();
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
    if (joined.includes('코드') && joined.includes('거래처')) return i;
  }
  return -1;
}

function colIndex(headers, ...cands) {
  for (const c of cands) {
    const i = headers.findIndex(h => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

const cliPath = process.argv[2];
const defaultPath = path.join(
  'z:',
  '10_미수관리',
  '미수금 공문 - 26년',
  '미수수수료 거래처(잔액)현황_26.07.27.xls',
);
const xlsPath = cliPath || defaultPath;

if (!fs.existsSync(xlsPath)) {
  console.error('파일을 찾을 수 없습니다:', xlsPath);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const wb = XLSX.readFile(xlsPath);
const lastSheet = wb.SheetNames[wb.SheetNames.length - 1];
const asOfDate = sheetDateToIso(lastSheet);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[lastSheet], {
  header: 1,
  defval: '',
  raw: true,
});

const headerIdx = findHeaderRow(rows);
if (headerIdx < 0) {
  console.error('헤더(코드·거래처)를 찾지 못했습니다. sheet=', lastSheet);
  process.exit(1);
}

const headers = (rows[headerIdx] ?? []).map(normHeader);
const iCode = colIndex(headers, '코드');
const iName = colIndex(headers, '거래처명', '거래처');
const iMgr = colIndex(headers, '담당');
const iCms = colIndex(headers, 'CMS');
const iMgmt = colIndex(headers, '관리');
const iPast = colIndex(headers, '과거일정');
const iSched = colIndex(headers, '일정');
const iContact = colIndex(headers, '연락');
const iNote = colIndex(headers, '참고');

if (iCode < 0 || iName < 0) {
  console.error('필수 열(코드·거래처) 없음', headers);
  process.exit(1);
}

/** @type {Array<{code:string,companyName:string,managerName:string,mgmtCategory:string,cmsNote:string,memo:string}>} */
const parsed = [];
let skipped = 0;

for (let r = headerIdx + 1; r < rows.length; r++) {
  const row = rows[r] ?? [];
  const code = cellStr(row[iCode]);
  const companyName = cellStr(row[iName]);
  if (!/^\d{3,}$/.test(code)) {
    skipped += 1;
    continue;
  }
  if (!companyName || /합계|총계/.test(companyName)) {
    skipped += 1;
    continue;
  }

  const mgrRaw = row[iMgr];
  const mgrCode = typeof mgrRaw === 'number' ? mgrRaw : Number(cellStr(mgrRaw));
  const managerName = MANAGER_MAP[mgrCode] || '';

  const mgmtRaw = iMgmt >= 0 ? row[iMgmt] : '';
  let mgmtCategory = '';
  if (typeof mgmtRaw === 'number' && Number.isFinite(mgmtRaw)) {
    mgmtCategory = CATEGORY_MAP[mgmtRaw] ?? '';
  } else if (cellStr(mgmtRaw) !== '') {
    const n = Number(cellStr(mgmtRaw));
    if (Number.isFinite(n)) mgmtCategory = CATEGORY_MAP[n] ?? '';
  }

  const cmsRaw = iCms >= 0 ? row[iCms] : '';
  let cmsNote = '';
  if (typeof cmsRaw === 'number' && Number.isFinite(cmsRaw)) {
    cmsNote = cmsRaw === 0 ? '' : String(cmsRaw);
  } else {
    cmsNote = cellStr(cmsRaw);
    if (cmsNote === '0') cmsNote = '';
  }

  const memo = buildMemo([
    iPast >= 0 ? row[iPast] : '',
    iSched >= 0 ? row[iSched] : '',
    iContact >= 0 ? row[iContact] : '',
    iNote >= 0 ? row[iNote] : '',
  ]);

  parsed.push({ code, companyName, managerName, mgmtCategory, cmsNote, memo });
}

// 동일 코드 중복 시 마지막 행 우선
const deduped = [...new Map(parsed.map(r => [r.code, r])).values()];
console.log(
  `parsed ${parsed.length} rows → ${deduped.length} unique from sheet=${lastSheet} (skipped ${skipped})`,
);

const sql = postgres(url, { max: 1, prepare: false });

try {
  let inserted = 0;
  let updated = 0;
  const CHUNK = 50;

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
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
            ${0}, ${0}, ${0}, ${0},
            ${row.managerName}, ${row.mgmtCategory}, ${row.cmsNote}, ${row.memo},
            ${asOfDate}, ${'status_seed'}, ${'status_seed'}
          )
          ON CONFLICT (external_code) DO UPDATE SET
            manager_name = CASE
              WHEN EXCLUDED.manager_name <> '' THEN EXCLUDED.manager_name
              ELSE arrears_entries.manager_name
            END,
            mgmt_category = EXCLUDED.mgmt_category,
            cms_note = CASE
              WHEN EXCLUDED.cms_note <> '' THEN EXCLUDED.cms_note
              ELSE arrears_entries.cms_note
            END,
            memo = EXCLUDED.memo,
            company_name = CASE
              WHEN arrears_entries.company_name = '' THEN EXCLUDED.company_name
              ELSE arrears_entries.company_name
            END,
            updated_by = ${'status_seed'},
            updated_at = now()
          RETURNING (xmax = 0) AS is_insert
        `;
        if (result[0]?.is_insert) inserted += 1;
        else updated += 1;
      }
    });
    process.stdout.write(`\r  progress ${Math.min(i + CHUNK, deduped.length)}/${deduped.length}`);
  }
  process.stdout.write('\n');

  console.log(
    `✓ status seed sheet=${lastSheet} asOf=${asOfDate} inserted=${inserted} updated=${updated}`,
  );
} catch (e) {
  console.error('이관 실패:', e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
