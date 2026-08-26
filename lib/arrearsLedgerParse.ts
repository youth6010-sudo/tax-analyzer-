import * as XLSX from 'xlsx';

export type LedgerArrearsRow = {
  externalCode: string;
  companyName: string;
  businessNo: string;
  representative: string;
  carryIn: number;
  debit: number;
  credit: number;
  balance: number;
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const s = String(v).replace(/,/g, '').replace(/\s/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * 세무사랑 등 원장 엑셀은 대변잔액(선수금·과납)을 잔액 열에 양수로 넣는 경우가 있음.
 * 전기이월+차변−대변이 음수인데 잔액열만 그 절댓값이면 부호를 복원한다.
 */
export function normalizeLedgerBalanceSign(opts: {
  carryIn: number;
  debit: number;
  credit: number;
  balance: number;
}): number {
  const carryIn = Math.round(opts.carryIn) || 0;
  const debit = Math.round(opts.debit) || 0;
  const credit = Math.round(opts.credit) || 0;
  const balance = Math.round(opts.balance) || 0;
  const computed = carryIn + debit - credit;
  if (computed < 0 && balance > 0 && balance === Math.abs(computed)) {
    return computed;
  }
  return balance;
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\s+/g, '')
    .trim();
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader);
    const joined = cells.join('|');
    if (joined.includes('코드') && joined.includes('거래처')) {
      return i;
    }
  }
  return -1;
}

function colIndex(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex(h => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** 파일명 `거래처원장_20260803_…` → YYYY-MM-DD */
export function asOfDateFromLedgerFilename(filename: string): string {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLedgerArrearsWorkbook(buffer: ArrayBuffer | Buffer): LedgerArrearsRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('엑셀 시트가 없습니다.');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    throw new Error('거래처원장 형식이 아닙니다. (코드·거래처 열 필요)');
  }

  const headers = (rows[headerIdx] ?? []).map(normalizeHeader);
  const iCode = colIndex(headers, '코드');
  const iName = colIndex(headers, '거래처', '거래처명');
  const iBiz = colIndex(headers, '등록번호');
  const iRep = colIndex(headers, '대표자명', '대표자');
  const iCarry = colIndex(headers, '전기이월');
  const iDebit = colIndex(headers, '차변');
  const iCredit = colIndex(headers, '대변');
  const iBalance = colIndex(headers, '잔액');

  if (iCode < 0 || iName < 0 || iBalance < 0) {
    throw new Error('필수 열(코드·거래처·잔액)을 찾지 못했습니다.');
  }

  const out: LedgerArrearsRow[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const externalCode = cellStr(row[iCode]);
    const companyName = cellStr(row[iName]);
    if (!externalCode && !companyName) continue;
    if (!externalCode) continue;
    // 합계/빈 행 스킵
    if (/합계|계$|총계/.test(companyName)) continue;

    const carryIn = iCarry >= 0 ? cellMoney(row[iCarry]) : 0;
    const debit = iDebit >= 0 ? cellMoney(row[iDebit]) : 0;
    const credit = iCredit >= 0 ? cellMoney(row[iCredit]) : 0;
    const rawBalance = cellMoney(row[iBalance]);

    out.push({
      externalCode,
      companyName,
      businessNo: iBiz >= 0 ? cellStr(row[iBiz]) : '',
      representative: iRep >= 0 ? cellStr(row[iRep]) : '',
      carryIn,
      debit,
      credit,
      balance: normalizeLedgerBalanceSign({
        carryIn,
        debit,
        credit,
        balance: rawBalance,
      }),
    });
  }

  return out;
}
