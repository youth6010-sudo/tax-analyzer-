import { reviewAccessConfig } from '@/lib/review/accessConfig';
import { companyLinkKey } from '@/lib/review/companyKey';
import type { CorpFeeEntry, CorpFeeIndex } from '@/lib/review/corpFeeTypes';
export type { CorpFeeEntry, CorpFeeIndex } from '@/lib/review/corpFeeTypes';
export { buildCorpRevenueByClientId } from '@/lib/review/corpFeeTypes';
import { getReviewGridMetaAsync, readReviewGridSheets } from '@/lib/review/gridData';
import {
  applyPatchesToSheet,
  cellAt,
  detectCorpRowKind,
  hasValue,
  type GridSheet,
} from '@/lib/review/gridSheetUtils';
import {
  listReviewNewRows,
  listReviewPatches,
  type ReviewNewRowInput,
} from '@/lib/review/reviewGridDb';
const FEE_STAFF_ORDER = ['블루', '다야', '윈터', '리아', '페리', '인디', '찰리'] as const;
const FEE_SEGMENT_GAP = 10;

const FEE_COL = 4;
const REVENUE_COL_LAST_YEAR = 5;
const ADJUSTMENT_COL_LAST_YEAR = 6;
const REVENUE_COL_THIS_YEAR = 9;
const ADJUSTMENT_COL_THIS_YEAR = 10;

function parseNumericValue(v: unknown): number | null {  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim().replace(/,/g, '');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function feeRowCompany(sheet: GridSheet, r: number): { v: string } | null {
  const bCell = cellAt(sheet, r, 2);  const bVal = bCell?.v;
  if (hasValue(bVal) && detectCorpRowKind(bVal) === 'client' && typeof bVal === 'string') {
    return { v: bVal };
  }
  const aCell = cellAt(sheet, r, 1);
  const aVal = aCell?.v;
  if (hasValue(aVal) && typeof aVal === 'string' && detectCorpRowKind(aVal) === 'client') {
    return { v: aVal };
  }
  return null;
}

function detectFeeSegments(sheet: GridSheet): { staff: string; startR: number; endR: number }[] {
  const starts: number[] = [];
  for (let r = 2; r <= sheet.maxR; r++) {
    const noCell = cellAt(sheet, r, 1);
    const companyCell = cellAt(sheet, r, 2);
    if (noCell?.v === 1 && companyCell && hasValue(companyCell.v)) {
      starts.push(r);
    }
  }
  return starts.map((startR, i) => ({
    staff: FEE_STAFF_ORDER[i] ?? '기타',
    startR,
    endR: (starts[i + 1] ?? sheet.maxR + 1) - 1,
  }));
}

function feeRowStaffMap(
  sheet: GridSheet,
  segments: { staff: string; startR: number; endR: number }[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const seg of segments) {
    let staff = seg.staff;
    let lastCompanyR: number | null = null;
    for (let r = seg.startR; r <= seg.endR; r++) {
      const companyCell = cellAt(sheet, r, 2);
      const company = companyCell?.v ?? null;
      if (detectCorpRowKind(company) !== 'client' || !hasValue(company)) continue;
      if (lastCompanyR !== null && r - lastCompanyR >= FEE_SEGMENT_GAP) {
        const nextIdx = FEE_STAFF_ORDER.indexOf(staff as (typeof FEE_STAFF_ORDER)[number]) + 1;
        if (nextIdx > 0 && nextIdx < FEE_STAFF_ORDER.length) {
          staff = FEE_STAFF_ORDER[nextIdx];
        }
      }
      map.set(r, staff);
      lastCompanyR = r;
    }
  }
  return map;
}

function entryFromRow(sheet: GridSheet, r: number, companyName: string, staff: string): CorpFeeEntry {
  return {
    companyName,
    staff,
    fee: parseNumericValue(cellAt(sheet, r, FEE_COL)?.v),
    revenueLastYear: parseNumericValue(cellAt(sheet, r, REVENUE_COL_LAST_YEAR)?.v),
    adjustmentLastYear: parseNumericValue(cellAt(sheet, r, ADJUSTMENT_COL_LAST_YEAR)?.v),
    revenueThisYear: parseNumericValue(cellAt(sheet, r, REVENUE_COL_THIS_YEAR)?.v),
    adjustmentThisYear: parseNumericValue(cellAt(sheet, r, ADJUSTMENT_COL_THIS_YEAR)?.v),
  };
}

function entryFromNewRow(row: ReviewNewRowInput): CorpFeeEntry | null {
  const cells = (row.cells ?? {}) as Record<string, { v?: unknown }>;
  const company =
    (cells['corp:1']?.v as string | undefined) ?? (cells['fee:2']?.v as string | undefined);
  if (!hasValue(company) || typeof company !== 'string') return null;

  const readFeeCol = (col: number): number | null => {
    const key = `fee:${col}`;
    return parseNumericValue(cells[key]?.v);
  };

  return {
    companyName: company,
    staff: row.owner ?? '',
    fee: readFeeCol(FEE_COL),
    revenueLastYear: readFeeCol(REVENUE_COL_LAST_YEAR),
    adjustmentLastYear: readFeeCol(ADJUSTMENT_COL_LAST_YEAR),
    revenueThisYear: readFeeCol(REVENUE_COL_THIS_YEAR),
    adjustmentThisYear: readFeeCol(ADJUSTMENT_COL_THIS_YEAR),
  };
}

function buildIndexFromSheet(sheet: GridSheet): Record<string, CorpFeeEntry> {
  const byKey: Record<string, CorpFeeEntry> = {};
  const segments = detectFeeSegments(sheet);
  const staffByRow = feeRowStaffMap(sheet, segments);

  for (const seg of segments) {
    for (let r = seg.startR; r <= seg.endR; r++) {
      const staff = staffByRow.get(r);
      if (!staff) continue;
      const companyInfo = feeRowCompany(sheet, r);
      if (!companyInfo) continue;
      const key = companyLinkKey(companyInfo.v);
      if (!key) continue;
      byKey[key] = entryFromRow(sheet, r, companyInfo.v, staff);
    }
  }

  return byKey;
}

function mergeNewRows(byKey: Record<string, CorpFeeEntry>, newRows: ReviewNewRowInput[]) {
  for (const row of newRows) {
    if (row.kind !== 'corp') continue;
    const entry = entryFromNewRow(row);
    if (!entry) continue;
    const key = companyLinkKey(entry.companyName);
    if (!key) continue;
    byKey[key] = entry;
  }
}

const CORP_FEE_SERVER_CACHE_MS = 60_000;
let corpFeeServerCache: {
  key: string;
  builtAt: number;
  index: CorpFeeIndex;
} | null = null;

function buildCacheKey(
  importedAt: string | null,
  patchCount: number,
  newRowCount: number,
): string {
  return `${importedAt ?? ''}:${patchCount}:${newRowCount}`;
}

export async function buildCorpFeeIndex(): Promise<CorpFeeIndex> {
  const meta = await getReviewGridMetaAsync();
  const [patches, newRows] = await Promise.all([listReviewPatches(), listReviewNewRows()]);
  const key = buildCacheKey(meta.importedAt, patches.length, newRows.length);
  const now = Date.now();
  if (
    corpFeeServerCache &&
    corpFeeServerCache.key === key &&
    now - corpFeeServerCache.builtAt < CORP_FEE_SERVER_CACHE_MS
  ) {
    return corpFeeServerCache.index;
  }

  const sheetName = reviewAccessConfig.corpFeeSheet;

  if (meta.missing) {
    const empty = { importedAt: null, sheetName, byKey: {} };
    corpFeeServerCache = { key, builtAt: now, index: empty };
    return empty;
  }

  const grid = await readReviewGridSheets([sheetName]);
  const feeSheetRaw = (grid.sheets as GridSheet[]).find(s => s.name === sheetName);
  if (!feeSheetRaw) {
    const empty = { importedAt: meta.importedAt, sheetName, byKey: {} };
    corpFeeServerCache = { key, builtAt: now, index: empty };
    return empty;
  }

  const patchedSheet = applyPatchesToSheet(feeSheetRaw, patches);
  const byKey = buildIndexFromSheet(patchedSheet);
  mergeNewRows(byKey, newRows);

  const index = {
    importedAt: meta.importedAt,
    sheetName,
    byKey,
  };
  corpFeeServerCache = { key, builtAt: now, index };
  return index;
}