import * as XLSX from 'xlsx';
import { ARREARS_MANAGER_CODE_MAP } from '@/lib/arrearsImportFilenames';

export type ParsedStatusRow = {
  externalCode: string;
  companyName: string;
  managerName: string;
  mgmtCategory: string;
  balance: number;
  carryIn: number;
  debit: number;
  credit: number;
  cmsNote: string;
  memo: string;
};

const CATEGORY_MAP: Record<number, string> = {
  0: 'recovery',
  1: 'bad',
  2: 'long',
  3: 'temp',
  4: 'cms',
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normHeader(h: unknown): string {
  return String(h ?? '').replace(/\s+/g, '').trim();
}

function parseMgmtCategory(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return CATEGORY_MAP[raw] ?? '';
  const s = cellStr(raw);
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return CATEGORY_MAP[n] ?? '';
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(normHeader);
    const joined = cells.join('|');
    if (joined.includes('코드') && (joined.includes('거래처명') || joined.includes('거래처'))) {
      return i;
    }
  }
  return -1;
}

function colIndex(headers: string[], ...cands: string[]): number {
  for (const c of cands) {
    const i = headers.findIndex(h => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function colIndexes(headers: string[], label: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === label || headers[i].includes(label)) out.push(i);
  }
  return out;
}

/** 시트명 26.08.31 → 2026.08.31 */
export function sheetNameToDotDate(sheetName: string): string {
  const m = String(sheetName).match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return '';
  const yy = Number(m[1]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${year}.${m[2]}.${m[3]}`;
}

export function parseArrearsStatusWorkbook(
  buffer: Buffer,
  opts?: { sheetName?: string },
): { asOfDate: string; rows: ParsedStatusRow[] } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = opts?.sheetName || wb.SheetNames[wb.SheetNames.length - 1] || '';
  if (!sheetName) throw new Error('현황표 시트가 없습니다.');
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`시트를 찾을 수 없습니다: ${sheetName}`);

  const asOfDate = sheetNameToDotDate(sheetName) || '';
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) throw new Error('현황표 헤더(코드·거래처명)를 찾지 못했습니다.');

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

  const out: ParsedStatusRow[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const externalCode = cellStr(row[iCode]);
    const companyName = cellStr(row[iName]);
    if (!/^\d{3,}$/.test(externalCode) || !companyName || /합계|총계/.test(companyName)) continue;

    const mgrRaw = row[iMgr];
    const mgrCode = typeof mgrRaw === 'number' ? mgrRaw : Number(cellStr(mgrRaw));
    const managerName = ARREARS_MANAGER_CODE_MAP[mgrCode] || '';

    const bFirst = balCols.length ? cellMoney(row[balCols[0]]) : 0;
    const bLast = balCols.length > 1 ? cellMoney(row[balCols[balCols.length - 1]]) : bFirst;
    const balance = bLast !== 0 ? bLast : bFirst;
    out.push({
      externalCode,
      companyName,
      managerName,
      mgmtCategory: iMgmt >= 0 ? parseMgmtCategory(row[iMgmt]) : '',
      balance,
      carryIn: iCarry >= 0 ? cellMoney(row[iCarry]) : 0,
      debit: debitCols.length ? cellMoney(row[debitCols[0]]) : 0,
      credit: creditCols.length ? cellMoney(row[creditCols[0]]) : 0,
      cmsNote: iCms >= 0 ? cellStr(row[iCms]) : '',
      memo: iPast >= 0 ? cellStr(row[iPast]) : '',
    });
  }

  return { asOfDate, rows: out };
}
