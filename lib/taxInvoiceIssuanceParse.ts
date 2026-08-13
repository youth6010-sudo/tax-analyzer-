/**
 * 국세청 전자세금계산서 대량발급 양식 (.xls)
 * — 공급받는자 + 품목1~N / 공급가액1~N
 * 레이아웃 A(월 기장): 공급받는자가 앞쪽
 * 레이아웃 B(조정료·기타·신고대리): 공급자 블록 후 공급받는자
 */
import * as XLSX from 'xlsx';

export type TaxInvoiceIssuanceLine = {
  companyName: string;
  businessNo: string;
  writeDate: string;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  /** 파일명·시트 힌트 (기타매출 / 신고대리 / 개인조정료 / 기장 등) */
  categoryHint: string;
  /** 엑셀 녹색 행(신규) */
  isNew?: boolean;
  /** 0-based sheet row (헤더 다음부터) — 녹색 매칭용 */
  sheetRow?: number;
};

/** 사무실(공급자) 사업자번호 — 공급받는자로 오인된 행 제외 */
const OFFICE_BIZ_NO = '7988501836';

function normalizeBizDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 10) return digits.slice(0, 10);
  // 엑셀 숫자 변환으로 앞자리 0이 사라진 경우
  return digits.padStart(10, '0');
}

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // 사업자번호가 숫자로 읽힌 경우
    const asInt = Math.round(v);
    if (asInt >= 1e9 && asInt < 1e13 && Number.isInteger(v)) {
      return String(asInt);
    }
    return String(v);
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\s+/g, '')
    .replace(/\n/g, '')
    .trim()
    .toLowerCase();
}

function formatWriteDate(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function categoryHintFromFilename(filename: string): string {
  const n = filename.replace(/\s+/g, '');
  if (/개인조정/.test(n)) return '개인조정료';
  if (/기타매출|기타수수료/.test(n)) return '기타매출';
  if (/신고대리/.test(n)) return '신고대리';
  if (/기장|월\.xls|월\.xlsx|\d{2}월\.xls/i.test(n)) return '기장료';
  return '';
}

/** 헤더 행에 품목1 + 공급가액1(+공급받는자) 있으면 발급 양식 */
export function isTaxInvoiceIssuanceSheet(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const headers = (rows[i] ?? []).map(normHeader);
    const hasItem = headers.some(h => /^품목1$/.test(h) || h === '품목1');
    const hasAmt = headers.some(h => h.includes('공급가액1'));
    const hasBuyer =
      headers.some(h => h.includes('공급받는자')) || headers.some(h => h.includes('상호'));
    if (hasItem && hasAmt && hasBuyer) return true;
  }
  return false;
}

type ColMap = {
  headerIdx: number;
  buyerBiz: number;
  buyerName: number;
  writeDate: number;
  itemSlots: Array<{ item: number; supply: number; tax: number }>;
};

function buildColMap(rows: unknown[][]): ColMap | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const headers = (rows[i] ?? []).map(normHeader);
    if (!headers.some(h => h.includes('품목1'))) continue;

    const findExact = (...cands: string[]) => {
      for (const c of cands) {
        const idx = headers.findIndex(h => h === c);
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const findIncl = (...cands: string[]) => {
      for (const c of cands) {
        const idx = headers.findIndex(h => h.includes(c));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    // 공급받는자 등록번호 우선 (공급자 등록번호와 구분)
    let buyerBiz = findIncl('공급받는자등록번호');
    if (buyerBiz < 0) {
      // 레이아웃 A: 앞에 있는 등록번호가 공급받는자
      buyerBiz = findIncl('등록번호');
    }
    let buyerName = findIncl('공급받는자상호');
    if (buyerName < 0) buyerName = findExact('상호') >= 0 ? findExact('상호') : findIncl('상호');

    const writeDate = findIncl('작성일자', '작성일');

    const itemSlots: ColMap['itemSlots'] = [];
    for (let n = 1; n <= 12; n++) {
      const item = findExact(`품목${n}`);
      const supply = findExact(`공급가액${n}`) >= 0 ? findExact(`공급가액${n}`) : findIncl(`공급가액${n}`);
      const tax = findExact(`세액${n}`) >= 0 ? findExact(`세액${n}`) : findIncl(`세액${n}`);
      if (item < 0 || supply < 0) continue;
      itemSlots.push({ item, supply, tax });
    }

    if (itemSlots.length === 0) continue;
    if (buyerBiz < 0 && buyerName < 0) continue;

    return { headerIdx: i, buyerBiz, buyerName, writeDate, itemSlots };
  }
  return null;
}

export function parseTaxInvoiceIssuanceWorkbook(
  buffer: ArrayBuffer | Buffer,
  filename = '',
  opts?: { greenRows?: ReadonlySet<number> },
): TaxInvoiceIssuanceLine[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('엑셀 시트가 없습니다.');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  if (!isTaxInvoiceIssuanceSheet(rows)) {
    throw new Error('국세청 세금계산서 대량발급 양식(품목1·공급가액1)이 아닙니다.');
  }

  const map = buildColMap(rows);
  if (!map) throw new Error('품목/공급받는자 열을 찾지 못했습니다.');

  const categoryHint = categoryHintFromFilename(filename);
  const greenRows = opts?.greenRows;
  const lines: TaxInvoiceIssuanceLine[] = [];

  for (let r = map.headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const companyName = map.buyerName >= 0 ? cellStr(row[map.buyerName]) : '';
    const bizRaw = map.buyerBiz >= 0 ? cellStr(row[map.buyerBiz]) : '';
    const businessNo = normalizeBizDigits(bizRaw);
    if (!companyName && businessNo.length < 10) continue;
    if (businessNo === OFFICE_BIZ_NO) continue;
    if (/세무법인청년들/.test(companyName)) continue;
    if (/합계|총계|소계/.test(companyName)) continue;

    const writeDate = formatWriteDate(map.writeDate >= 0 ? cellStr(row[map.writeDate]) : '');
    const isNew = greenRows?.has(r) ?? false;

    for (const slot of map.itemSlots) {
      const itemName = cellStr(row[slot.item]);
      const supplyAmount = cellMoney(row[slot.supply]);
      const taxAmount = slot.tax >= 0 ? cellMoney(row[slot.tax]) : 0;
      const totalAmount = supplyAmount + taxAmount;
      if (!itemName || totalAmount <= 0) continue;
      lines.push({
        companyName,
        businessNo: businessNo.length === 10 ? businessNo : '',
        writeDate,
        itemName,
        supplyAmount,
        taxAmount,
        categoryHint,
        isNew,
        sheetRow: r,
      });
    }
  }

  return lines;
}

/** 품목 청구액 = 공급가액 + 세액 */
export function taxInvoiceLineTotal(line: Pick<TaxInvoiceIssuanceLine, 'supplyAmount' | 'taxAmount'>): number {
  return Math.round(line.supplyAmount || 0) + Math.round(line.taxAmount || 0);
}

/** 수임처 수수료 품목명 정규화 (연환산용) */
export function normalizeFeeItemNameFromInvoice(itemName: string): string {
  const s = itemName.replace(/\s+/g, ' ').trim();
  if (/기장수수료|기장료/.test(s)) return '기장수수료';
  if (/기타수수료|기타매출/.test(s)) return '기타수수료';
  if (/개인조정료|조정료/.test(s) && !/성실/.test(s)) return '조정료';
  return s;
}
