import { reviewAccessConfig } from '@/lib/review/accessConfig';
import {
  buildAltLinkKeys,
  companyLinkKey,
  coreCompanyKey,
  scopedReviewKey,
} from '@/lib/review/companyKey';
import { readReviewGridSheets } from '@/lib/review/gridData';
import {
  applyPatchesToSheet,
  cellAt,
  hasValue,
  isIncomeClientRow,
  type GridSheet,
} from '@/lib/review/gridSheetUtils';
import { listReviewNewRows, listReviewPatches, type ReviewNewRowInput } from '@/lib/review/reviewGridDb';

const INCOME_COMPANY_COL = 4;
const INCOME_NAME_COL = 3;
const INCOME_NO_COL = 2;

export type IncomeCompanyEntry = {
  reviewKey: string;
  reviewName: string;
  personName: string;
  companyLabel: string;
  altKeys: string[];
  owner: string;
  sheetName: string;
  row: number;
};

function readPersonName(sheet: GridSheet, r: number): string {
  const name = cellAt(sheet, r, INCOME_NAME_COL)?.v;
  return hasValue(name) && typeof name === 'string' ? name.trim() : '';
}

function readCompanyLabel(sheet: GridSheet, r: number): string {
  const company = cellAt(sheet, r, INCOME_COMPANY_COL)?.v;
  return hasValue(company) && typeof company === 'string' ? company.trim() : '';
}

function buildIncomeEntry(input: {
  companyLabel: string;
  personName: string;
  owner: string;
  sheetName: string;
  row: number;
}): IncomeCompanyEntry | null {
  const reviewName = input.companyLabel || input.personName;
  if (!reviewName) return null;
  const altKeys = [
    ...new Set([
      ...buildAltLinkKeys(input.companyLabel, input.personName, reviewName),
      coreCompanyKey(input.companyLabel),
      coreCompanyKey(input.personName),
      coreCompanyKey(reviewName),
    ].filter((k): k is string => typeof k === 'string' && k.length >= 2)),
  ];
  const baseKey = altKeys[0] ?? companyLinkKey(reviewName);
  if (!baseKey) return null;
  const reviewKey = scopedReviewKey(input.owner, baseKey, input.personName);
  const allAltKeys = [...new Set([reviewKey, baseKey, ...altKeys])];
  return {
    reviewKey,
    reviewName,
    personName: input.personName,
    companyLabel: input.companyLabel,
    altKeys: allAltKeys,
    owner: input.owner,
    sheetName: input.sheetName,
    row: input.row,
  };
}

function indexFromSheet(sheet: GridSheet, owner: string, byKey: Map<string, IncomeCompanyEntry>) {
  for (let r = 2; r <= sheet.maxR; r++) {
    const no = cellAt(sheet, r, INCOME_NO_COL)?.v ?? null;
    const name = cellAt(sheet, r, INCOME_NAME_COL)?.v ?? null;
    if (!isIncomeClientRow(no, name)) continue;

    const entry = buildIncomeEntry({
      companyLabel: readCompanyLabel(sheet, r),
      personName: readPersonName(sheet, r),
      owner,
      sheetName: sheet.name,
      row: r,
    });
    if (!entry) continue;
    byKey.set(entry.reviewKey, entry);
  }
}

function mergeNewIncomeRows(byKey: Map<string, IncomeCompanyEntry>, newRows: ReviewNewRowInput[]) {
  for (const row of newRows) {
    if (row.kind !== 'income' || !row.owner) continue;
    const cells = (row.cells ?? {}) as Record<string, { v?: unknown }>;
    const company =
      (cells[String(INCOME_COMPANY_COL)]?.v as string | undefined) ??
      (cells['4']?.v as string | undefined);
    const name = cells[String(INCOME_NAME_COL)]?.v ?? cells['3']?.v;
    const companyLabel = hasValue(company) && typeof company === 'string' ? company.trim() : '';
    const personName = hasValue(name) && typeof name === 'string' ? name.trim() : '';
    const entry = buildIncomeEntry({
      companyLabel,
      personName,
      owner: row.owner,
      sheetName: row.sheetName ?? '',
      row: 0,
    });
    if (!entry) continue;
    byKey.set(entry.reviewKey, entry);
  }
}

export async function buildIncomeCompanyIndex(): Promise<IncomeCompanyEntry[]> {
  const sheetNames: { name: string; owner: string }[] = [];
  for (const [owner, map] of Object.entries(reviewAccessConfig.sheetMap)) {
    if (map.income) sheetNames.push({ name: map.income, owner });
  }
  if (!sheetNames.length) return [];

  const names = sheetNames.map(s => s.name);
  const [grid, patches, newRows] = await Promise.all([
    readReviewGridSheets(names),
    listReviewPatches(),
    listReviewNewRows(),
  ]);

  const byKey = new Map<string, IncomeCompanyEntry>();
  const ownerBySheet = new Map(sheetNames.map(s => [s.name, s.owner]));

  for (const raw of grid.sheets as GridSheet[]) {
    if (!raw?.name) continue;
    const owner = ownerBySheet.get(raw.name) ?? '';
    const patched = applyPatchesToSheet(raw, patches);
    indexFromSheet(patched, owner, byKey);
  }

  mergeNewIncomeRows(byKey, newRows);
  return [...byKey.values()].sort((a, b) => a.reviewName.localeCompare(b.reviewName, 'ko'));
}
