/**
 * 사무실 「미수수수료 안내」xls와 동일 레이아웃·서식으로 워크북 생성.
 * 열: 내역 | 금액(vat 포함) | 지급내역 | 지급일시 | 잔액
 * (금액=차변/청구, 지급내역=대변/입금)
 * ※ 서버 전용(fs). 클라이언트는 arrearsLetterExportShared 사용.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  filterHiddenCancelledTaxInvoiceLines,
  formatArrearsLetterDate,
  formatArrearsPaidDateKo,
  letterBalanceFromLines,
  letterRunningBalances,
  linesForCurrentLetterCycle,
} from '@/app/types/arrears';
import { formatArrearsLetterLineLabels, formatArrearsPaidDateOffice } from '@/lib/arrearsLineLabel';
import {
  ARREARS_LETTER_ADDR,
  ARREARS_LETTER_BANK,
  ARREARS_LETTER_ORG,
  ARREARS_LETTER_TEL,
  letterCompanyDisplayName,
} from '@/lib/arrearsLetterExportShared';

export {
  ARREARS_LETTER_ADDR,
  ARREARS_LETTER_BANK,
  ARREARS_LETTER_ORG,
  ARREARS_LETTER_TEL,
  arrearsLetterExportFilename,
  letterCompanyDisplayName,
} from '@/lib/arrearsLetterExportShared';

/** 금액(청구·지급) */
const FMT_AMT = '#,##0_ ';
/** 잔액 — 0이면 "-" */
const FMT_BAL = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-';
const FILL_HEADER = 'FFECECEC';
const FILL_TOTAL = 'FFD9D9D9';
const FILL_WHITE = 'FFFFFFFF';
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF222222' } },
  left: { style: 'thin', color: { argb: 'FF222222' } },
  bottom: { style: 'thin', color: { argb: 'FF222222' } },
  right: { style: 'thin', color: { argb: 'FF222222' } },
};

function applyTableBorder(row: ExcelJS.Row, fromCol: number, toCol: number): void {
  for (let c = fromCol; c <= toCol; c++) {
    row.getCell(c).border = { ...BORDER_THIN } as ExcelJS.Borders;
  }
}

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
  /** 미수 수수료·총액 잔액. 없으면 Σ(금액−지급) */
  entryBalance?: number;
  /** true면 미납 사이클 필터 없이 lines 그대로 (화면「전체」표시와 동일) */
  includeFullHistory?: boolean;
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

/** 사무실 엑셀 지급일시: `2월3일` (공백 없음). YYYYMMDD·한국어 모두 수용 */
export function formatLetterPaidDateExcel(raw: string | number | Date | null | undefined): string {
  const s = formatArrearsPaidDateOffice(raw) || formatArrearsPaidDateKo(raw);
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

function loadPublicPng(filename: string): Buffer | null {
  try {
    const p = path.join(process.cwd(), 'public', filename);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

type LetterImages = {
  headerId?: number;
  footerId?: number;
};

function appendArrearsLetterSheet(
  wb: ExcelJS.Workbook,
  sheet: ArrearsLetterExportSheet,
  usedNames: Set<string>,
  images: LetterImages = {},
): void {
  const company = letterCompanyDisplayName(sheet.companyName || '');
  const letterDate = formatArrearsLetterDate(sheet.letterDate || '');
  const cycleLines = sheet.includeFullHistory
    ? sheet.lines || []
    : linesForCurrentLetterCycle(sheet.lines || []);
  const lines = filterHiddenCancelledTaxInvoiceLines(cycleLines, sheet.companyName || '');
  const portalLabels = formatArrearsLetterLineLabels(lines, sheet.letterDate || '');
  const running = letterRunningBalances(lines);
  const totalAmount = lines.reduce((s, l) => s + Math.round(l.amount || 0), 0);
  const totalPaid = lines.reduce((s, l) => s + Math.round(l.paidAmount || 0), 0);
  const balance =
    sheet.entryBalance != null && Number.isFinite(sheet.entryBalance)
      ? Math.round(sheet.entryBalance)
      : letterBalanceFromLines(lines);

  const name = safeExcelSheetName(sheet.companyName || company || '시트', usedNames);
  const ws = wb.addWorksheet(name, {
    properties: { defaultRowHeight: 13.5, dyDescent: 0.3 },
    views: [
      {
        showGridLines: false,
        showRowColHeaders: true,
        showRuler: true,
        state: 'normal',
        style: 'pageBreakPreview',
        zoomScale: 60,
        zoomScaleNormal: 100,
        activeCell: 'B2',
      },
    ],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      scale: 95,
      pageOrder: 'downThenOver',
      margins: {
        left: 0.7,
        right: 0.7,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3,
      },
    },
  });

  // 참고 양식(미수수수료_*.xlsx)과 동일 열 너비
  ws.getColumn(1).width = 0.75;
  ws.getColumn(2).width = 16.625;
  ws.getColumn(3).width = 16.625;
  ws.getColumn(4).width = 16.625;
  ws.getColumn(5).width = 16.625;
  ws.getColumn(6).width = 17.375;

  // 참고 (2)/(3)/(4).xlsx 고정 앵커(EMU native*) — ExcelJS col 분수는 EMU와 불일치
  const HEADER_LOGO_W = 200;
  const HEADER_LOGO_H = 51;
  const FOOTER_LOGO_W = 247.25364829396327;
  const FOOTER_LOGO_H = 66;

  // 1~2 헤더 로고 — Youth tax Management Corporation(3행) 바로 위
  ws.getRow(1).height = 8.1;
  {
    const row = ws.getRow(2);
    row.height = 36;
    paintWhite(row);
    if (images.headerId != null) {
      ws.addImage(images.headerId, {
        tl: {
          nativeCol: 2,
          nativeColOff: 1000125,
          nativeRow: 0,
          nativeRowOff: 85725,
        },
        ext: { width: HEADER_LOGO_W, height: HEADER_LOGO_H },
        editAs: 'oneCell',
      } as unknown as ExcelJS.ImagePosition);
    } else {
      const cell = row.getCell(2);
      cell.value = '세무법인청년들';
      cell.font = { name: '맑은 고딕', size: 14, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.mergeCells(2, 2, 2, 6);
    }
  }

  // 3 영문 기관명
  {
    const row = ws.getRow(3);
    row.height = 14.1;
    paintWhite(row);
    const cell = row.getCell(2);
    cell.value = ARREARS_LETTER_ORG;
    cell.font = { name: '맑은 고딕', size: 9, color: { argb: 'FF6B7280' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(3, 2, 3, 6);
  }

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

  // 16 헤더 — 화면 인쇄와 동일한 회색+테두리
  {
    const row = ws.getRow(16);
    row.height = 16;
    const headers = ['내역', '금액(vat 포함)', '지급내역', '지급일시', '잔액'];
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 2);
      cell.value = h;
      cell.font = { name: '맑은 고딕', size: 9, bold: true };
      cell.fill = solidFill(FILL_HEADER);
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
    applyTableBorder(row, 2, 6);
  }

  let r = 17;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const row = ws.getRow(r);
    row.height = 15;
    paintWhite(row);
    const font = { name: '맑은 고딕', size: 9 };
    row.getCell(2).value = portalLabels[i] || l.description || '';
    row.getCell(2).font = font;
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    const amt = Math.round(l.amount || 0);
    const paid = Math.round(l.paidAmount || 0);
    if (amt) setMoney(row.getCell(3), amt, FMT_AMT);
    else {
      row.getCell(3).value = null;
      row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    }
    if (paid) setMoney(row.getCell(4), paid, FMT_AMT);
    else {
      row.getCell(4).value = null;
      row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    }

    const paidDate = formatArrearsPaidDateKo(l.paidDate) || formatLetterPaidDateExcel(l.paidDate);
    if (paidDate) {
      row.getCell(5).value = paidDate;
      row.getCell(5).font = font;
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    setBalance(row.getCell(6), running[i] ?? 0);
    row.getCell(6).font = font;
    applyTableBorder(row, 2, 6);
    r += 1;
  }

  {
    const row = ws.getRow(r);
    row.height = 16;
    paintWhite(row);
    const font = { name: '맑은 고딕', size: 9, bold: true };
    row.getCell(2).value = '총액';
    row.getCell(2).font = font;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).fill = solidFill(FILL_HEADER);
    setMoney(row.getCell(3), totalAmount || null, FMT_AMT);
    row.getCell(3).font = font;
    row.getCell(3).fill = solidFill(FILL_HEADER);
    setMoney(row.getCell(4), totalPaid || null, FMT_AMT);
    row.getCell(4).font = font;
    row.getCell(4).fill = solidFill(FILL_HEADER);
    row.getCell(5).fill = solidFill(FILL_HEADER);
    setBalance(row.getCell(6), balance);
    row.getCell(6).font = font;
    row.getCell(6).fill = solidFill(FILL_HEADER);
    applyTableBorder(row, 2, 6);
    r += 1;
  }

  {
    const row = ws.getRow(r);
    row.height = 16;
    const font = { name: '맑은 고딕', size: 9, bold: true };
    for (let c = 2; c <= 5; c++) {
      row.getCell(c).fill = solidFill(FILL_TOTAL);
      row.getCell(c).font = font;
    }
    row.getCell(2).value = '미수 수수료';
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(r, 2, r, 5);
    setBalance(row.getCell(6), balance);
    row.getCell(6).font = font;
    row.getCell(6).fill = solidFill(FILL_TOTAL);
    applyTableBorder(row, 2, 6);
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

  // 참고 (2)/(3)/(4): 계좌 다음 로고용 공백(16.5) → 주소(16.5) → 전화(16.5)
  const logoSpacerExcelRow = r;
  ws.getRow(r).height = 16.5;
  paintWhite(ws.getRow(r));
  r += 1;

  {
    const row = ws.getRow(r);
    row.height = 16.5;
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
    row.height = 16.5;
    paintWhite(row);
    const cell = row.getCell(4);
    cell.value = ARREARS_LETTER_TEL;
    cell.font = { name: '맑은 고딕', size: 9 };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.mergeCells(r, 4, r, 6);
    r += 1;
  }

  if (images.footerId != null) {
    ws.addImage(images.footerId, {
      // (3).xlsx: col≈1.33, 로고행(계좌 다음) 중간부터, ≈247×66
      tl: {
        nativeCol: 1,
        nativeColOff: 54891,
        nativeRow: logoSpacerExcelRow - 1,
        nativeRowOff: 76200,
      },
      ext: { width: FOOTER_LOGO_W, height: FOOTER_LOGO_H },
      editAs: 'oneCell',
    } as unknown as ExcelJS.ImagePosition);
  }

  // 인쇄 영역 고정 (A열~F열, 사용한 행까지) — 참고 파일과 동일하게 가로 1페이지 맞춤
  const lastRow = Math.max(r, ws.actualRowCount || r);
  ws.pageSetup.printArea = `A1:F${lastRow}`;
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
}

export function buildArrearsLetterWorkbook(sheets: ArrearsLetterExportSheet[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Youth tax';
  wb.created = new Date();

  const images: LetterImages = {};
  const headerBuf = loadPublicPng('arrears-letter-header.png');
  const footerBuf = loadPublicPng('arrears-letter-footer.png') || headerBuf;
  if (headerBuf) {
    images.headerId = wb.addImage({
      // ExcelJS Buffer 타입과 Node Buffer 버전 차이
      buffer: headerBuf as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
  }
  if (footerBuf) {
    images.footerId = wb.addImage({
      buffer: footerBuf as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
  }

  const used = new Set<string>();
  if (!sheets.length) {
    appendArrearsLetterSheet(
      wb,
      { companyName: '(비어 있음)', letterDate: '', lines: [] },
      used,
      images,
    );
    return wb;
  }
  for (const s of sheets) {
    appendArrearsLetterSheet(wb, s, used, images);
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
