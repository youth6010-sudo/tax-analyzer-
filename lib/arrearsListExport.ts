/**
 * 미수관리 화면(총미수 목록)과 같은 열 구성의 요약 엑셀
 */
import ExcelJS from 'exceljs';
import {
  arrearsCategoryLabel,
  formatArrearsWon,
  type ArrearsEntryDto,
  type ArrearsManagerTotal,
} from '@/app/types/arrears';

const FMT_AMT = '#,##0';

export type ArrearsListExportMeta = {
  asOfDate: string;
  totalBalance: number;
  totalsByManager: ArrearsManagerTotal[];
};

export function arrearsListExportFilename(asOfDate: string): string {
  const d = (asOfDate || '').trim();
  let stamp = '';
  const m = d.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (m) stamp = `${m[1].slice(2)}.${m[2]}.${m[3]}`;
  else {
    const now = new Date();
    stamp = `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  }
  return `미수목록_전체_${stamp}.xlsx`;
}

export async function buildArrearsListWorkbook(
  items: ArrearsEntryDto[],
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
    { header: '사업자번호', key: 'biz', width: 14 },
    { header: '대표자', key: 'rep', width: 10 },
    { header: '유출', key: 'churn', width: 8 },
    { header: '비고', key: 'note', width: 18 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, name: '맑은 고딕', size: 10 };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const item of items) {
    const noteParts: string[] = [];
    if (item.externalCode.startsWith('letter:')) noteParts.push('연결필요');
    if (item.balanceDiffKind === 'mismatch') {
      noteParts.push(
        `불일치 ${item.balanceDiff && item.balanceDiff > 0 ? '+' : ''}${formatArrearsWon(item.balanceDiff ?? 0)}`,
      );
    }
    if (item.balanceDiffKind === 'ledger_only') noteParts.push('원장만');

    const row = ws.addRow({
      code: item.externalCode.startsWith('letter:') ? '' : item.externalCode,
      name: item.companyName,
      balance: Math.round(item.balance),
      reason: item.reasonSummary || '',
      manager: item.managerName || '',
      category: arrearsCategoryLabel(item.mgmtCategory),
      memo: item.memo || '',
      biz: item.businessNo || '',
      rep: item.representative || '',
      churn: item.isChurned ? '유출' : '',
      note: noteParts.join(' · '),
    });
    row.getCell('balance').numFmt = FMT_AMT;
    row.font = { name: '맑은 고딕', size: 10 };
  }

  const totalRow = ws.addRow({
    code: '',
    name: '총미수',
    balance: Math.round(meta.totalBalance),
    reason: `${items.length}건`,
    manager: '',
    category: '',
    memo: meta.asOfDate ? `기준일 ${meta.asOfDate}` : '',
    biz: '',
    rep: '',
    churn: '',
    note: '',
  });
  totalRow.font = { bold: true, name: '맑은 고딕', size: 10 };
  totalRow.getCell('balance').numFmt = FMT_AMT;
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' },
  };

  if (meta.totalsByManager.length) {
    const wsMgr = wb.addWorksheet('담당별 합계');
    wsMgr.columns = [
      { header: '담당', key: 'manager', width: 12 },
      { header: '건수', key: 'count', width: 10 },
      { header: '미수 합계', key: 'balance', width: 14 },
    ];
    wsMgr.getRow(1).font = { bold: true, name: '맑은 고딕', size: 10 };
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
    sum.font = { bold: true, name: '맑은 고딕', size: 10 };
    sum.getCell('balance').numFmt = FMT_AMT;
  }

  return wb;
}

export async function workbookToXlsxBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
