/**
 * 미수관리 화면(총미수 목록)과 같은 열 구성의 요약 엑셀 (ExcelJS)
 */
import ExcelJS from 'exceljs';
import { type ArrearsManagerTotal } from '@/app/types/arrears';
import {
  arrearsListRowFillArgb,
  toArrearsListSheetRow,
  type ArrearsListExportItem,
} from '@/lib/arrearsListExportShared';

export {
  arrearsListExportFilename,
  arrearsListRowFillArgb,
  buildArrearsListManagerTotals,
  toArrearsListExportItem,
  toArrearsListSheetRow,
  type ArrearsListExportItem,
  type ArrearsListSheetRow,
} from '@/lib/arrearsListExportShared';

const FMT_AMT = '#,##0';

export type ArrearsListExportMeta = {
  asOfDate: string;
  totalBalance: number;
  totalsByManager: ArrearsManagerTotal[];
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export async function buildArrearsListWorkbook(
  items: ArrearsListExportItem[],
  meta: ArrearsListExportMeta,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '세무법인청년들';
  wb.created = new Date();

  const ws = wb.addWorksheet('총미수', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: '코드', key: 'code', width: 12 },
    { header: '상호', key: 'name', width: 28 },
    { header: '미수 잔액', key: 'balance', width: 14 },
    { header: '미수 사유', key: 'reason', width: 36 },
    { header: '담당', key: 'manager', width: 10 },
    { header: '관리', key: 'category', width: 10 },
    { header: '메모', key: 'memo', width: 24 },
  ];
  // 코드·사유·메모 등 — 날짜/숫자 자동변환 방지 (텍스트)
  for (const key of ['code', 'name', 'reason', 'manager', 'category', 'memo'] as const) {
    ws.getColumn(key).numFmt = '@';
  }

  const header = ws.getRow(1);
  header.font = { bold: true, name: '맑은 고딕', size: 10 };
  header.fill = solidFill('FFE2E8F0');
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  const applyTextCell = (cell: ExcelJS.Cell, text: string) => {
    cell.value = String(text ?? '');
    cell.numFmt = '@';
  };

  for (const item of items) {
    const sheet = toArrearsListSheetRow(item);
    const row = ws.addRow({
      code: '',
      name: '',
      balance: sheet['미수 잔액'],
      reason: '',
      manager: '',
      category: '',
      memo: '',
    });
    applyTextCell(row.getCell('code'), sheet.코드);
    applyTextCell(row.getCell('name'), sheet.상호);
    applyTextCell(row.getCell('reason'), sheet['미수 사유']);
    applyTextCell(row.getCell('manager'), sheet.담당);
    applyTextCell(row.getCell('category'), sheet.관리);
    applyTextCell(row.getCell('memo'), sheet.메모);
    row.getCell('balance').numFmt = FMT_AMT;
    row.font = { name: '맑은 고딕', size: 10 };
    const fillArgb = arrearsListRowFillArgb(item);
    if (fillArgb) {
      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        cell.fill = solidFill(fillArgb);
        cell.font = { name: '맑은 고딕', size: 10 };
      }
    }
  }

  const totalRow = ws.addRow({
    code: '',
    name: '',
    balance: Math.round(meta.totalBalance),
    reason: '',
    manager: '',
    category: '',
    memo: '',
  });
  applyTextCell(totalRow.getCell('name'), '총미수');
  applyTextCell(totalRow.getCell('reason'), `${items.length}건`);
  applyTextCell(
    totalRow.getCell('memo'),
    meta.asOfDate ? `기준일 ${meta.asOfDate}` : '',
  );
  totalRow.getCell('balance').numFmt = FMT_AMT;
  for (let c = 1; c <= 7; c++) {
    totalRow.getCell(c).fill = solidFill('FFFEF3C7');
    totalRow.getCell(c).font = { bold: true, name: '맑은 고딕', size: 10 };
  }

  if (meta.totalsByManager.length) {
    const wsMgr = wb.addWorksheet('담당별 합계');
    wsMgr.columns = [
      { header: '담당', key: 'manager', width: 12 },
      { header: '건수', key: 'count', width: 10 },
      { header: '미수 합계', key: 'balance', width: 14 },
    ];
    wsMgr.getRow(1).font = { bold: true, name: '맑은 고딕', size: 10 };
    wsMgr.getRow(1).fill = solidFill('FFE2E8F0');
    for (const t of meta.totalsByManager) {
      const r = wsMgr.addRow({
        manager: t.managerName,
        count: t.count,
        balance: Math.round(t.balance),
      });
      r.getCell('balance').numFmt = FMT_AMT;
      r.font = { name: '맑은 고딕', size: 10 };
    }
    const sum = wsMgr.addRow({
      manager: '합계',
      count: items.length,
      balance: Math.round(meta.totalBalance),
    });
    sum.getCell('balance').numFmt = FMT_AMT;
    for (let c = 1; c <= 3; c++) {
      sum.getCell(c).fill = solidFill('FFFEF3C7');
      sum.getCell(c).font = { bold: true, name: '맑은 고딕', size: 10 };
    }
  }

  return wb;
}

export async function workbookToXlsxBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
