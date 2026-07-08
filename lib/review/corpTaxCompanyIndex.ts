import { reviewAccessConfig } from '@/lib/review/accessConfig';
import { companyLinkKey, scopedReviewKey } from '@/lib/review/companyKey';
import { readReviewGridSheets } from '@/lib/review/gridData';
import {
  applyPatchesToSheet,
  cellAt,
  detectCorpRowKind,
  hasValue,
  isCorpDividendHeaderRow,
  sliceSheet,
  type GridSheet,
} from '@/lib/review/gridSheetUtils';
import { listReviewNewRows, listReviewPatches, type ReviewNewRowInput } from '@/lib/review/reviewGridDb';

export type CorpTaxCompanyEntry = {
  reviewKey: string;
  reviewName: string;
  owner: string;
  sheetName: string;
  row: number;
};

function indexFromCorpSheet(
  sheet: GridSheet,
  owner: string,
  byKey: Map<string, CorpTaxCompanyEntry>,
) {
  const minC = sheet.minC ?? 1;
  let inDividend = false;

  for (let r = 3; r <= sheet.maxR; r++) {
    if (isCorpDividendHeaderRow(sheet, r)) {
      inDividend = true;
      continue;
    }
    if (inDividend) continue;

    const companyCell = cellAt(sheet, r, minC);
    const company = companyCell?.v;
    const rowKind = detectCorpRowKind(company);
    if (rowKind !== 'client') continue;
    if (!hasValue(company) || typeof company !== 'string') continue;

    const baseKey = companyLinkKey(company);
    if (!baseKey) continue;

    const reviewKey = scopedReviewKey(owner, baseKey);
    byKey.set(reviewKey, {
      reviewKey,
      reviewName: company.trim(),
      owner,
      sheetName: sheet.name,
      row: r,
    });
  }
}

function mergeNewCorpRows(byKey: Map<string, CorpTaxCompanyEntry>, newRows: ReviewNewRowInput[]) {
  for (const row of newRows) {
    if (row.kind !== 'corp' || !row.owner) continue;
    const cells = (row.cells ?? {}) as Record<string, { v?: unknown }>;
    const company =
      (cells['corp:1']?.v as string | undefined) ?? (cells['fee:2']?.v as string | undefined);
    if (!hasValue(company) || typeof company !== 'string') continue;
    const baseKey = companyLinkKey(company);
    if (!baseKey || !row.owner) continue;
    const reviewKey = scopedReviewKey(row.owner, baseKey);
    byKey.set(reviewKey, {
      reviewKey,
      reviewName: company.trim(),
      owner: row.owner,
      sheetName: row.sheetName ?? reviewAccessConfig.corpSheet,
      row: 0,
    });
  }
}

export async function buildCorpTaxCompanyIndex(): Promise<CorpTaxCompanyEntry[]> {
  const corpSheetName = reviewAccessConfig.corpSheet;
  if (!corpSheetName) return [];

  const [grid, patches, newRows] = await Promise.all([
    readReviewGridSheets([corpSheetName]),
    listReviewPatches(),
    listReviewNewRows(),
  ]);

  const rawSheet = (grid.sheets as GridSheet[]).find(s => s?.name === corpSheetName);
  if (!rawSheet) return [];

  const patchedFull = applyPatchesToSheet(rawSheet, patches);
  const byKey = new Map<string, CorpTaxCompanyEntry>();

  for (const [owner, map] of Object.entries(reviewAccessConfig.sheetMap)) {
    if (!map.corpCols || map.corpCols.length !== 2) continue;
    const [minC, maxC] = map.corpCols;
    const slice = sliceSheet(patchedFull, minC, maxC);
    indexFromCorpSheet(slice, owner, byKey);
  }

  mergeNewCorpRows(byKey, newRows);
  return [...byKey.values()].sort((a, b) => a.reviewName.localeCompare(b.reviewName, 'ko'));
}
