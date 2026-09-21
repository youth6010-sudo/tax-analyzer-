/**
 * 거래처별 현황(8/31)에 없는 2026년 7·8월 기장 줄을 DB에서 제거
 * (Neon 복원으로 다시 들어온 “가짜 7·8월” 정리 — 더좋은사람들 등)
 *
 * node --import tsx scripts/strip-jul-aug-not-in-aug31-excel.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const APPLY = process.argv.includes('--apply');
const detailPath = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260831.xlsx';

function cellStr(v) {
  return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
}
function cellMoney(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function isSummary(desc) {
  const d = desc.replace(/\s+/g, '');
  return /전기이월|월계|누계|분기계/.test(d);
}

/** code -> Set('2026-07'|'2026-08') that have debit>0 in excel */
function excelJulAugDebits(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const out = new Map();
  for (const sheetName of wb.SheetNames) {
    const fromName = sheetName.match(/^\((\d{3,})\)/);
    if (!fromName) continue;
    const code = fromName[1];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    });
    let periodYear = 2026;
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      for (const cell of rows[i] ?? []) {
        const s = cellStr(cell);
        const m2 = s.match(/^(\d{4})\.\d{2}\.\d{2}\s*~\s*(\d{4})/);
        if (m2) periodYear = Number(m2[2]) || Number(m2[1]) || periodYear;
      }
    }
    const months = out.get(code) ?? new Set();
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const dateRaw = cellStr(row[0]);
      const desc = cellStr(row[3]);
      const debit = cellMoney(row[5]);
      if (!debit || isSummary(desc)) continue;
      let iso = '';
      if (/^\d{2}-\d{2}$/.test(dateRaw)) {
        iso = `${periodYear}-${dateRaw.slice(0, 2)}-${dateRaw.slice(3, 5)}`;
      } else if (row[0] instanceof Date && !Number.isNaN(row[0].getTime())) {
        const d = row[0];
        iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      if (!iso.startsWith('2026-07') && !iso.startsWith('2026-08')) continue;
      months.add(iso.slice(0, 7));
    }
    if (months.size) out.set(code, months);
  }
  return out;
}

function lineYm(desc) {
  const d = String(desc || '').replace(/\s+/g, '');
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  const mo = Number(m[2]);
  return `${y}-${String(mo).padStart(2, '0')}`;
}

const { getDb } = await import('../db/index.ts');
const { arrearsEntries } = await import('../db/schema.ts');
const { listLetterLines, replaceLetterLines } = await import('../lib/arrearsLetterDb.ts');
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');

const excelMonths = excelJulAugDebits(fs.readFileSync(detailPath));
console.log('excel codes with Jul/Aug debit', excelMonths.size);
console.log('01407 excel months', [...(excelMonths.get('01407') ?? [])]);
console.log('00208 excel months', [...(excelMonths.get('00208') ?? [])]);

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const report = [];

for (const e of entries) {
  const allowed = excelMonths.get(e.externalCode) ?? new Set();
  const lines = await listLetterLines(e.id);
  const next = [];
  const removed = [];
  for (const l of lines) {
    const ym = lineYm(l.description);
    if (ym === '2026-07' || ym === '2026-08') {
      // 기장성 청구(amount>0)만 — 입금만 있는 줄은 유지
      if (Math.round(l.amount) > 0 && !allowed.has(ym)) {
        removed.push(`${ym}:${l.source}:${l.description}:${l.amount}`);
        continue;
      }
    }
    next.push({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    });
  }
  if (!removed.length) continue;
  const before = letterBalanceFromLines(lines);
  const after = letterBalanceFromLines(next);
  report.push({
    code: e.externalCode,
    name: e.companyName,
    bal: Math.round(e.balance),
    before,
    after,
    removed,
  });
  if (APPLY) {
    await replaceLetterLines(e.id, 'strip-jul-aug-not-in-aug31', next, { syncBalance: false });
  }
}

report.sort((a, b) => Math.abs(b.before - b.bal) - Math.abs(a.before - a.bal));
console.log(JSON.stringify({ apply: APPLY, count: report.length, sample: report.slice(0, 25) }, null, 2));
const focus = report.filter(r => ['01407', '00208', '00209', '00666'].includes(r.code));
console.log('focus', JSON.stringify(focus, null, 2));
