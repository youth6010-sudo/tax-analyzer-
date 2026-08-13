import * as XLSX from 'xlsx';
import { formatArrearsPaidDateKo } from '@/app/types/arrears';

export type ParsedLetterLine = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
};

export type ParsedLetterSheet = {
  companyName: string;
  letterDate: string;
  lines: ParsedLetterLine[];
  /** 시트 「미수 수수료」행 잔액 (있으면) */
  sheetBalance: number | null;
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

function looksLikeHeader(row: unknown[]): boolean {
  const cells = (row ?? []).map(c => cellStr(c).replace(/\s+/g, ''));
  const joined = cells.join('|');
  return joined.includes('내역') && (joined.includes('금액') || joined.includes('vat'));
}

function isTotalRow(desc: string): boolean {
  const d = desc.replace(/\s+/g, '');
  return d === '총액' || d.startsWith('총액') || d === '합계' || d === '미수수수료';
}

function extractLetterDate(rows: unknown[][]): string {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? [];
    for (let c = row.length - 1; c >= 0; c--) {
      const s = cellStr(row[c]);
      if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[1]}.${m[2]}.${m[3]}`;
      const m2 = s.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
      if (m2) {
        const yy = Number(m2[1]);
        const year = yy >= 70 ? 1900 + yy : 2000 + yy;
        return `${year}.${m2[2]}.${m2[3]}`;
      }
    }
  }
  return '';
}

/** 단일 시트 → 공문 내역 */
export function parseLetterSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedLetterSheet | null {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

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

  // 엑셀 양식: 보통 B열 시작 (인덱스 1)
  if (iDesc < 0) iDesc = 1;
  if (iAmt < 0) iAmt = iDesc + 1;
  if (iPay < 0) iPay = iAmt + 1;
  if (iDate < 0) iDate = iPay + 1;
  if (iBal < 0) iBal = iDate + 1;

  const lines: ParsedLetterLine[] = [];
  let sheetBalance: number | null = null;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const desc = cellStr(row[iDesc]);
    let amount = cellMoney(row[iAmt]);
    const paidAmount = cellMoney(row[iPay]);
    const paidDateRaw = row[iDate];
    const paidDateStr = cellStr(paidDateRaw);
    const balCell = cellMoney(row[iBal]);

    const compact = desc.replace(/\s+/g, '');
    if (compact === '미수수수료') {
      sheetBalance = cellMoney(row[iBal] ?? row[iAmt]);
      break;
    }
    if (desc && isTotalRow(desc)) {
      // 총액 행의 잔액을 sheetBalance 후보로
      const bal = balCell;
      if (bal !== 0 || amount !== 0) {
        sheetBalance = bal || amount - paidAmount;
      }
      continue;
    }

    // 이월 행: 금액칸이 비고 잔액칸에만 있는 경우(예: 팀코리아 2021년 이월 990,000)
    if (
      amount === 0 &&
      paidAmount === 0 &&
      balCell !== 0 &&
      /이월/.test(compact)
    ) {
      amount = balCell;
    }

    // 내역 없는 지급-only / 메모성 지급일시 행 포함
    if (!desc && !amount && !paidAmount && !paidDateStr) continue;
    if (!desc && !amount && !paidAmount) continue;

    lines.push({
      description: desc,
      amount,
      paidAmount,
      // 메모성 지급일시(예: 110,000*6)는 정규화하지 않고 유지
      paidDate: formatArrearsPaidDateKo(paidDateRaw as string | number | Date),
    });
  }

  if (!lines.length) return null;

  return {
    companyName: cellStr(sheetName),
    letterDate: extractLetterDate(rows),
    lines,
    sheetBalance,
  };
}

export function managerFromLetterFilename(name: string): string {
  const pairs: [string, string][] = [
    ['인디', '인디'],
    ['다야', '다야'],
    ['리아', '리아'],
    ['블루', '블루'],
    ['윈터', '윈터'],
    ['페리', '페리'],
  ];
  for (const [key, nick] of pairs) {
    if (name.includes(key)) return nick;
  }
  return '';
}

/** 담당자별 미수수수료.xls 파싱 */
export function parseArrearsLetterWorkbook(buffer: ArrayBuffer | Buffer): {
  managerName: string;
  sheets: ParsedLetterSheet[];
} {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: ParsedLetterSheet[] = [];
  for (const name of wb.SheetNames) {
    const parsed = parseLetterSheet(wb.Sheets[name], name);
    if (parsed) sheets.push(parsed);
  }
  return { managerName: '', sheets };
}

export function parseArrearsLetterWorkbookFile(
  buffer: ArrayBuffer | Buffer,
  filename: string,
): {
  managerName: string;
  sheets: ParsedLetterSheet[];
} {
  const result = parseArrearsLetterWorkbook(buffer);
  return {
    managerName: managerFromLetterFilename(filename),
    sheets: result.sheets,
  };
}

export function letterLinesBalance(lines: ParsedLetterLine[]): number {
  return lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
}
