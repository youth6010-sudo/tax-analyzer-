import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import postgres from 'postgres';
import { parseSuimcheoExportRows } from './lib/suimcheo-export-parse.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const xlsxPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', '변환파일', '수임처-20260702104054.xlsx');
const wb = XLSX.readFile(xlsxPath);
const sheet = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
const excel = parseSuimcheoExportRows(rows);

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const db = await sql`SELECT business_no, company_name, intake_data FROM clients`;
const norm = b => (b || '').replace(/\D/g, '');
const byBiz = new Map(db.map(r => [norm(r.business_no), r]));

let synced = 0;
const counts = { employed: 0, daily: 0, laborContentReport: 0, retirement: 0, bizIncome: 0, interestDividend: 0, otherTax: 0 };
const incomeChanges = [];

for (const c of excel) {
  const r = byBiz.get(norm(c.businessNo));
  if (!r) continue;
  synced += 1;
  const it = r.intake_data?.incomeTypes || {};
  const ex = c.intakeData.incomeTypes;
  for (const k of Object.keys(counts)) if (ex[k]) counts[k] += 1;
  const diffs = [];
  const labels = {
    employed: '상용',
    daily: '일용',
    retirement: '퇴직',
    bizIncome: '사업',
    interestDividend: '이자배당',
    otherTax: '기타',
    laborContentReport: '근로내용확인',
  };
  for (const [k, label] of Object.entries(labels)) {
    if (!!it[k] !== !!ex[k]) diffs.push(`${label}:${ex[k] ? 'Y' : 'N'}`);
  }
  if (diffs.length) incomeChanges.push(`${r.company_name} (${c.businessNo}) → ${diffs.join(', ')}`);
}

await sql.end();

const lines = [
  `동기화 매칭: ${synced}건`,
  `엑셀 Y — 상용:${counts.employed} 일용:${counts.daily} 근로내용확인:${counts.laborContentReport} 퇴직:${counts.retirement} 사업:${counts.bizIncome} 이자배당:${counts.interestDividend} 기타:${counts.otherTax}`,
  `DB·엑셀 소득유형 불일치: ${incomeChanges.length}건`,
  '',
  ...incomeChanges,
];
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync-result-summary.txt');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
