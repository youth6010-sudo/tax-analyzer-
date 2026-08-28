/**
 * 오프라인·하나비 엑셀 공문 → JSON (배포 DB 동기화용)
 * Usage: node scripts/export-inactive-arrears-seed.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  if (headerIdx < 0) return { lines: [], letterDate: '2026.07.27' };

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

const xlsPath = path.join('z:', '10_미수관리', '미수금 공문 - 26년', '미수수수료-인디-26.07.27.xls');
const wb = XLSX.readFile(xlsPath, { cellDates: true });

const seed = {
  version: 1,
  exportedAt: new Date().toISOString(),
  entries: [
    { externalCode: '00183', companyName: '오프라인', balance: 0 },
    { externalCode: '00199', companyName: '하나비', balance: 207_301 },
  ].map(t => {
    const parsed = parseSheet(wb.Sheets[t.companyName]);
    return { ...t, letterDate: parsed.letterDate, lines: parsed.lines };
  }),
};

const out = path.join(root, 'data', 'arrears-inactive-seed.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(seed, null, 2), 'utf8');
console.log('Wrote', out);
for (const e of seed.entries) {
  console.log(`  ${e.companyName} balance=${e.balance} lines=${e.lines.length}`);
}
