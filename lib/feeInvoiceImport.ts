import * as XLSX from 'xlsx';

import type { FeeLineItem } from '@/app/utils/feeBreakdown';
import { normalizeBizNo } from '@/app/utils/filingCheck';
import {
  isTaxInvoiceIssuanceSheet,
  normalizeFeeItemNameFromInvoice,
  parseTaxInvoiceIssuanceWorkbook,
} from '@/lib/taxInvoiceIssuanceParse';

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

function mapFromIssuance(buffer: ArrayBuffer, filename: string): ParsedFeeInvoiceMap {
  const lines = parseTaxInvoiceIssuanceWorkbook(buffer, filename);
  const byBiz = new Map<string, Map<string, number>>();

  for (const line of lines) {
    const biz = normalizeBizNo(line.businessNo);
    if (!biz || biz.length !== 10 || !line.itemName || !line.supplyAmount) continue;
    const itemName = normalizeFeeItemNameFromInvoice(line.itemName);
    let items = byBiz.get(biz);
    if (!items) {
      items = new Map();
      byBiz.set(biz, items);
    }
    // 같은 품목은 최근(또는 합산) — 기장/기타는 월 금액이므로 마지막 값 유지, 조정·기타 일회성은 합산
    if (itemName === '기장수수료' || itemName === '기타수수료') {
      items.set(itemName, line.supplyAmount);
    } else {
      items.set(itemName, (items.get(itemName) ?? 0) + line.supplyAmount);
    }
  }

  const out: ParsedFeeInvoiceMap = new Map();
  for (const [biz, items] of byBiz) {
    const feeItems: FeeLineItem[] = [];
    for (const [itemName, supplyAmount] of items) {
      if (supplyAmount === 0) continue;
      feeItems.push({ itemName, supplyAmount });
    }
    feeItems.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko'));
    if (feeItems.length) out.set(biz, feeItems);
  }
  return out;
}

/** 매출전자세금계산서목록 또는 국세청 대량발급 양식 → 사업자번호별 품목·공급가액 */
export function parseFeeInvoiceWorkbook(
  buffer: ArrayBuffer,
  filename = '',
): ParsedFeeInvoiceMap {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => n.includes('세금계산서')) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return new Map();

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  if (isTaxInvoiceIssuanceSheet(matrix)) {
    return mapFromIssuance(buffer, filename);
  }

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
