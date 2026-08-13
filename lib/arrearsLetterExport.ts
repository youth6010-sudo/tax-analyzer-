/**
 * 사무실 「미수수수료 안내」xls와 동일 레이아웃으로 SheetJS 워크북 생성.
 * 열: 내역 | 금액(vat 포함) | 지급내역 | 지급일시 | 잔액
 * (금액=차변/청구, 지급내역=대변/입금)
 */
import * as XLSX from 'xlsx';
import {
  formatArrearsLetterDate,
  letterBalanceFromLines,
  letterRunningBalances,
} from '@/app/types/arrears';

export const ARREARS_LETTER_ORG = 'Youth tax Management Corporation';
export const ARREARS_LETTER_BANK = '부산은행 113-2016-5229-07 세무법인 청년들';
export const ARREARS_LETTER_ADDR = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호';
export const ARREARS_LETTER_TEL = 'TEL : 051-783-6007 / FAX : 051-784-6007';

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

function rowVals(...cells: unknown[]): unknown[] {
  // 샘플처럼 B열(인덱스 1)부터 본문 — A는 비움
  return ['', ...cells];
}

/** 단일 거래처 안내서 → 2차원 배열 (SheetJS) */
export function buildArrearsLetterAoA(sheet: ArrearsLetterExportSheet): unknown[][] {
  const company = sheet.companyName || '';
  const letterDate = formatArrearsLetterDate(sheet.letterDate || '');
  const lines = sheet.lines || [];
  const running = letterRunningBalances(lines);
  const totalAmount = lines.reduce((s, l) => s + Math.round(l.amount || 0), 0);
  const totalPaid = lines.reduce((s, l) => s + Math.round(l.paidAmount || 0), 0);
  const balance = letterBalanceFromLines(lines);

  const aoa: unknown[][] = [];
  aoa.push(['', '', '', ARREARS_LETTER_ORG]);
  aoa.push(['미수 수수료 안내']);
  aoa.push(rowVals(`수    신  :  ${company}`, '', '', '', letterDate));
  aoa.push(rowVals('제    목  :  미수수수료 안내'));
  aoa.push(['귀사의 무궁한 발전을 기원합니다.']);
  aoa.push(rowVals('다음과 같이 미수수수료를 안내하여 드리오니 빠른 시일내에 결제 부탁드립니다.'));
  aoa.push(['- 다         음 -']);
  aoa.push(rowVals('1. 미수 수수료 안내'));
  aoa.push(rowVals('내역', '금액(vat 포함)', '지급내역', '지급일시', '잔액'));

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    aoa.push(
      rowVals(
        l.description || '',
        l.amount ? Math.round(l.amount) : '',
        l.paidAmount ? Math.round(l.paidAmount) : '',
        l.paidDate || '',
        Math.round(running[i] ?? 0),
      ),
    );
  }

  aoa.push(rowVals('총액', totalAmount, totalPaid, '', balance));
  aoa.push(rowVals('미수 수수료', '', '', '', balance));
  aoa.push(rowVals('2. 입금 계좌 번호'));
  aoa.push(rowVals(ARREARS_LETTER_BANK));
  aoa.push(['', '', '', ARREARS_LETTER_ADDR]);
  aoa.push(['', '', '', ARREARS_LETTER_TEL]);
  return aoa;
}

export function appendArrearsLetterSheet(
  wb: XLSX.WorkBook,
  sheet: ArrearsLetterExportSheet,
  usedNames: Set<string>,
): void {
  const name = safeExcelSheetName(sheet.companyName, usedNames);
  const aoa = buildArrearsLetterAoA(sheet);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 3 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export function buildArrearsLetterWorkbook(sheets: ArrearsLetterExportSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
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

export function workbookToBuffer(wb: XLSX.WorkBook, bookType: 'xlsx' | 'xls' = 'xlsx'): Buffer {
  const out = XLSX.write(wb, { type: 'buffer', bookType });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/**
 * 파일명: 미수수수료_{담당}-YY.MM.DD.xls
 * 인디만 사무실 관례상 `미수수수료-인디-…`
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
  return `미수수수료${sep}${mgr}-${stamp}.${ext}`;
}
