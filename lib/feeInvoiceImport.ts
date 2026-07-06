import * as XLSX from 'xlsx';

import type { FeeLineItem } from '@/app/utils/feeBreakdown';
import { normalizeBizNo } from '@/app/utils/filingCheck';

const BIZ_COL = '공급받는자사업자등록번호';
const ITEM_COL = '품목명';
const AMOUNT_COL = '품목공급가액';

export type ParsedFeeInvoiceMap = Map<string, FeeLineItem[]>;

function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** 매출전자세금계산서목록 엑셀 → 사업자번호별 품목·공급가액 */
export function parseFeeInvoiceWorkbook(buffer: ArrayBuffer): ParsedFeeInvoiceMap {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => n.includes('세금계산서')) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return new Map();

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const byBiz = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const biz = normalizeBizNo(String(row[BIZ_COL] ?? ''));
    const itemName = String(row[ITEM_COL] ?? '').trim();
    const amount = parseAmount(row[AMOUNT_COL]);
    if (!biz || biz.length !== 10 || !itemName || amount == null || amount === 0) continue;

    let items = byBiz.get(biz);
    if (!items) {
      items = new Map();
      byBiz.set(biz, items);
    }
    items.set(itemName, (items.get(itemName) ?? 0) + amount);
  }

  const out: ParsedFeeInvoiceMap = new Map();
  for (const [biz, items] of byBiz) {
    const lines: FeeLineItem[] = [];
    for (const [itemName, supplyAmount] of items) {
      if (supplyAmount === 0) continue;
      lines.push({ itemName, supplyAmount });
    }
    lines.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko'));
    if (lines.length) out.set(biz, lines);
  }
  return out;
}

export type FeeInvoiceImportMatch = {
  clientId: string;
  companyName: string;
  businessNo: string;
  manager: string | null;
  feeItems: FeeLineItem[];
  feeSummary: number | null;
};

export type FeeInvoiceImportPreview = {
  matched: FeeInvoiceImportMatch[];
  unmatchedBizNos: string[];
  skippedNoPermission: number;
};
