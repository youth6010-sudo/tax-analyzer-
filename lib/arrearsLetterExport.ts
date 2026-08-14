/**
 * 사무실 「미수수수료 안내」xls와 동일 레이아웃·서식으로 워크북 생성.
 * 열: 내역 | 금액(vat 포함) | 지급내역 | 지급일시 | 잔액
 * (금액=차변/청구, 지급내역=대변/입금)
 */
import ExcelJS from 'exceljs';
import {
  formatArrearsLetterDate,
  formatArrearsPaidDateKo,
  letterBalanceFromLines,
  letterRunningBalances,
} from '@/app/types/arrears';

export const ARREARS_LETTER_ORG = 'Youth tax Management Corporation';
export const ARREARS_LETTER_BANK = '부산은행 113-2016-5229-07 세무법인 청년들';
export const ARREARS_LETTER_ADDR = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호';
export const ARREARS_LETTER_TEL = 'TEL : 051-783-6007 / FAX : 051-784-6007';

/** 금액(청구·지급) */
const FMT_AMT = '#,##0_ ';
/** 잔액 — 0이면 "-" */
const FMT_BAL = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-';
const FILL_GRAY = 'FF969696';
const FILL_WHITE = 'FFFFFFFF';

export type ArrearsLetterExportLine = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
};

export type ArrearsLetterExportSheet = {
  companyName: string;
  letterDate: string;
  lines: ArrearsLetterExportLine[];
};

/** Excel 시트명 안전화 (31자, 금지문자) */
export function safeExcelSheetName(raw: string, used: Set<string>): string {
  let base = String(raw || '시트')
    .replace(/[\\/?*[\]:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) base = '시트';
  if (base.length > 31) base = base.slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = `(${n})`;
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(name);
  return name;
}

/** 공문 수신처 표기: (주) → ㈜ */
export function letterCompanyDisplayName(name: string): string {
  return String(name || '')
    .replace(/\(주\)/g, '㈜')
    .replace(/㈜\s+/g, '㈜')
    .trim();
}

/** 사무실 엑셀 지급일시: `2월3일` (공백 없음) */
export function formatLetterPaidDateExcel(raw: string | number | Date | null | undefined): string {
  const s = formatArrearsPaidDateKo(raw);
  if (!s) return '';
  return s.replace(/(\d+)\s*월\s*(\d+)\s*일/, '$1월$2일');
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function paintWhite(row: ExcelJS.Row, cols = 6): void {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    if (!cell.fill) cell.fill = solidFill(FILL_WHITE);
  }
}

function setMoney(cell: ExcelJS.Cell, value: number | null | undefined, fmt: string): void {
  if (value == null || !Number.isFinite(value) || value === 0) {
    cell.value = null;
    return;
  }
  cell.value = Math.round(value);
  cell.numFmt = fmt;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function setBalance(cell: ExcelJS.Cell, value: number): void {
  cell.value = Math.round(value);
  cell.numFmt = FMT_BAL;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function appendArrearsLetterSheet(
  wb: ExcelJS.Workbook,
  sheet: ArrearsLetterExportSheet,
  usedNames: Set<string>,
): void {
  const company = letterCompanyDisplayName(sheet.companyName || '');
  const letterDate = formatArrearsLetterDate(sheet.letterDate || '');
  const lines = sheet.lines || [];
  const running = letterRunningBalances(lines);
  const totalAmount = lines.reduce((s, l) => s + Math.round(l.amount || 0), 0);
  const totalPaid = lines.reduce((s, l) => s + Math.round(l.paidAmount || 0), 0);
  const balance = letterBalanceFromLines(lines);

  const name = safeExcelSheetName(sheet.companyName || company || '시트', usedNames);
  const ws = wb.addWorksheet(name, {
    properties: { defaultRowHeight: 13.5 },
    views: [{ showGridLines: true }],
  });

  ws.getColumn(1).width = 0.8;
  ws.getColumn(2).width = 16.6;
  ws.getColumn(3).width = 16.6;
  ws.getColumn(4).width = 16.6;
  ws.getColumn(5).width = 16.6;
  ws.getColumn(6).width = 17.4;

  // 1 빈 행
  ws.getRow(1).height = 6;

  // 2 기관명
  {
    const row = ws.getRow(2);
    row.height = 26.25;
    const cell = row.getCell(4);
    cell.value = ARREARS_LETTER_ORG;
    cell.font = { name: '맑은 고딕', size: 11, bold: true };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.mergeCells(2, 4, 2, 6);
  }

  // 3 빈 행
  ws.getRow(3).height = 12;

  // 4 제목
  {
    const row = ws.getRow(4);
    row.height = 31.5;
    const cell = row.getCell(1);
    cell.value = '미수 수수료 안내';
    cell.font = { name: '맑은 고딕', size: 18, bold: true, underline: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(4, 1, 4, 6);
  }

  // 5 빈 행
  ws.getRow(5).height = 5.25;

  // 6 수신 / 일자
  {
    const row = ws.getRow(6);
    row.height = 17.25;
    paintWhite(row);
    row.getCell(2).value = `수    신  :  ${company}`;
    row.getCell(2).font = { name: '맑은 고딕', size: 10 };
    row.getCell(6).value = letterDate;
    row.getCell(6).font = { name: '맑은 고딕', size: 10 };
    row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // 7 제목
  {
    const row = ws.getRow(7);
    row.height = 17.25;
    paintWhite(row);
    row.getCell(2).value = '제    목  :  미수수수료 안내';
    row.getCell(2).font = { name: '맑은 고딕', size: 10 };
  }

  // 8 빈 행
  ws.getRow(8).height = 5.25;

  // 9 인사
  {
    const row = ws.getRow(9);
    row.height = 15.75;
    paintWhite(row);
    row.getCell(1).value = '      귀사의 무궁한 발전을 기원합니다.';
    row.getCell(1).font = { name: '맑은 고딕', size: 10 };
  }

  // 10 본문
  {
    const row = ws.getRow(10);
    row.height = 15.75;
    paintWhite(row);
    row.getCell(2).value =
      ' 다음과 같이 미수수수료를 안내하여 드리오니 빠른 시일내에 결제 부탁드립니다.';
    row.getCell(2).font = { name: '맑은 고딕', size: 10 };
  }

  // 11 빈 행
  ws.getRow(11).height = 8.25;

  // 12 다음
  {
    const row = ws.getRow(12);
    row.height = 15;
    paintWhite(row);
    const cell = row.getCell(1);
    cell.value = '- 다         음 -';
    cell.font = { name: '맑은 고딕', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(12, 1, 12, 6);
  }

  // 13 빈 행
  ws.getRow(13).height = 6;

  // 14 절 제목
  {
    const row = ws.getRow(14);
    row.height = 15.75;
    paintWhite(row);
    row.getCell(2).value = '1. 미수 수수료 안내';
    row.getCell(2).font = { name: '맑은 고딕', size: 10, bold: true };
  }

  // 15 빈 행
  ws.getRow(15).height = 6;

  // 16 헤더
  {
    const row = ws.getRow(16);
    row.height = 13.5;
    paintWhite(row);
    const headers = ['내역', '금액(vat 포함)', '지급내역', '지급일시', '잔액'];
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 2);
      cell.value = h;
      cell.font = { name: '맑은 고딕', size: 9, bold: true };
      cell.alignment = {
        horizontal: i === 0 ? 'left' : i === 3 ? 'center' : 'right',
        vertical: 'middle',
      };
      if (i === 4) cell.numFmt = FMT_BAL;
    });
  }

  let r = 17;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const row = ws.getRow(r);
    row.height = 13.5;
    paintWhite(row);
    const font = { name: '맑은 고딕', size: 9 };
    row.getCell(2).value = l.description || '';
    row.getCell(2).font = font;

    const amt = Math.round(l.amount || 0);
    const paid = Math.round(l.paidAmount || 0);
    if (amt) setMoney(row.getCell(3), amt, FMT_AMT);
    else row.getCell(3).value = null;
    if (paid) setMoney(row.getCell(4), paid, FMT_AMT);
    else row.getCell(4).value = null;

    const paidDate = formatLetterPaidDateExcel(l.paidDate);
    if (paidDate) {
      row.getCell(5).value = paidDate;
      row.getCell(5).font = font;
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    setBalance(row.getCell(6), running[i] ?? 0);
    row.getCell(6).font = font;
    r += 1;
  }

  {
    const row = ws.getRow(r);
    row.height = 13.5;
    paintWhite(row);
    const font = { name: '맑은 고딕', size: 9, bold: true };
    row.getCell(2).value = '총액';
    row.getCell(2).font = font;
    setMoney(row.getCell(3), totalAmount || null, FMT_AMT);
    row.getCell(3).font = font;
    setMoney(row.getCell(4), totalPaid || null, FMT_AMT);
    row.getCell(4).font = font;
    setBalance(row.getCell(6), balance);
    row.getCell(6).font = font;
    r += 1;
  }

  {
    const row = ws.getRow(r);
    row.height = 13.5;
    for (let c = 1; c <= 6; c++) {
      row.getCell(c).fill = solidFill(FILL_GRAY);
    }
    const font = { name: '맑은 고딕', size: 9, bold: true };
    row.getCell(2).value = '미수 수수료';
    row.getCell(2).font = font;
    setBalance(row.getCell(6), balance);
    row.getCell(6).font = font;
    r += 1;
  }

  // 빈 2행
  ws.getRow(r).height = 8;
  r += 1;
  ws.getRow(r).height = 8;
  r += 1;

  {
    const row = ws.getRow(r);
    row.height = 15;
    paintWhite(row);
    row.getCell(2).value = '2. 입금 계좌 번호';
    row.getCell(2).font = { name: '맑은 고딕', size: 10, bold: true };
    r += 1;
  }
  {
    const row = ws.getRow(r);
    row.height = 15;
    paintWhite(row);
    row.getCell(2).value = ARREARS_LETTER_BANK;
    row.getCell(2).font = { name: '맑은 고딕', size: 10 };
    r += 1;
  }

  ws.getRow(r).height = 8;
  r += 1;

  {
    const row = ws.getRow(r);
    row.height = 15;
    paintWhite(row);
    const cell = row.getCell(4);
    cell.value = ARREARS_LETTER_ADDR;
    cell.font = { name: '맑은 고딕', size: 9 };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.mergeCells(r, 4, r, 6);
    r += 1;
  }
  {
    const row = ws.getRow(r);
    row.height = 15;
    paintWhite(row);
    const cell = row.getCell(4);
    cell.value = ARREARS_LETTER_TEL;
    cell.font = { name: '맑은 고딕', size: 9 };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.mergeCells(r, 4, r, 6);
  }
}

export function buildArrearsLetterWorkbook(sheets: ArrearsLetterExportSheet[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Youth tax';
  wb.created = new Date();
  const used = new Set<string>();
  if (!sheets.length) {
    appendArrearsLetterSheet(
      wb,
      { companyName: '(비어 있음)', letterDate: '', lines: [] },
      used,
    );
    return wb;
  }
  for (const s of sheets) {
    appendArrearsLetterSheet(wb, s, used);
  }
  return wb;
}

/** 스타일 유지 위해 xlsx로 기록 (.xls 요청도 동일 바이너리, 확장자만 구분) */
export async function workbookToBuffer(
  wb: ExcelJS.Workbook,
  _bookType: 'xlsx' | 'xls' = 'xlsx',
): Promise<Buffer> {
  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/**
 * 파일명: 미수수수료_{담당}-YY.MM.DD.xlsx
 * 인디만 사무실 관례상 `미수수수료-인디-…`
 * (서식 있는 파일을 위해 xlsx 사용 · Excel에서 기존 .xls와 동일하게 열림)
 */
export function arrearsLetterExportFilename(
  managerName: string,
  letterDate = '',
  ext: 'xlsx' | 'xls' = 'xlsx',
): string {
  const d = formatArrearsLetterDate(letterDate);
  let stamp = '';
  const m = d.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m) stamp = `${m[1].slice(2)}.${m[2]}.${m[3]}`;
  else {
    const now = new Date();
    stamp = `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  }
  const mgr = (managerName || '전체').replace(/[\\/:*?"<>|]/g, '').trim() || '전체';
  const sep = mgr === '인디' ? '-' : '_';
  // 스타일(회색 미수행 등)은 xlsx에서만 유지 → 항상 xlsx 확장자
  const realExt = 'xlsx';
  void ext;
  return `미수수수료${sep}${mgr}-${stamp}.${realExt}`;
}
