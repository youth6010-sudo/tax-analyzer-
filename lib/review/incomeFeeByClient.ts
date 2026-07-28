import { buildClientIdToReviewKeysMap } from '@/lib/review/clientLink';
import { buildIncomeCompanyIndex, type IncomeCompanyEntry } from '@/lib/review/incomeCompanyIndex';
import { readReviewGridSheets } from '@/lib/review/gridData';
import { applyPatchesToSheet, cellAt, type GridSheet } from '@/lib/review/gridSheetUtils';
import { listReviewPatches } from '@/lib/review/reviewGridDb';

/** 종소 검토표 수수료 열 */
const INCOME_FEE_COL = 14;
/** 사업수수료 열 — 있으면 합산 */
const INCOME_BIZ_FEE_COL = 26;

function parseNumericValue(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const t = v.trim().replace(/,/g, '');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function feeFromIncomeRow(sheet: GridSheet, r: number): number | null {
  if (r < 1) return null;
  const a = parseNumericValue(cellAt(sheet, r, INCOME_FEE_COL)?.v) ?? 0;
  const b = parseNumericValue(cellAt(sheet, r, INCOME_BIZ_FEE_COL)?.v) ?? 0;
  const sum = a + b;
  return sum !== 0 ? sum : null;
}

/**
 * 종소세 검토표 수수료 → clientId 맵
 * (수수료 + 사업수수료 합, 연결 reviewKey 기준)
 */
export async function buildIncomeFeeByClientId(): Promise<Record<string, number | null>> {
  const [entries, byClientId, patches] = await Promise.all([
    buildIncomeCompanyIndex(),
    buildClientIdToReviewKeysMap(),
    listReviewPatches(),
  ]);

  const entryByKey = new Map<string, IncomeCompanyEntry>();
  for (const e of entries) {
    entryByKey.set(e.reviewKey, e);
    for (const alt of e.altKeys) entryByKey.set(alt, e);
  }

  const sheetNames = [...new Set(entries.map(e => e.sheetName).filter(Boolean))];
  const grid = sheetNames.length ? await readReviewGridSheets(sheetNames) : { sheets: [] };
  const patchedByName = new Map<string, GridSheet>();
  for (const raw of grid.sheets as GridSheet[]) {
    if (!raw?.name) continue;
    patchedByName.set(raw.name, applyPatchesToSheet(raw, patches));
  }

  const feeByReviewKey = new Map<string, number | null>();
  for (const e of entries) {
    const sheet = patchedByName.get(e.sheetName);
    if (!sheet) continue;
    feeByReviewKey.set(e.reviewKey, feeFromIncomeRow(sheet, e.row));
  }

  const out: Record<string, number | null> = {};
  for (const [clientId, hints] of Object.entries(byClientId)) {
    const incomeHint = hints.find(h => (h.taxKinds ?? []).includes('income'));
    if (!incomeHint) continue;
    const entry = entryByKey.get(incomeHint.reviewKey);
    if (!entry) {
      out[clientId] = feeByReviewKey.get(incomeHint.reviewKey) ?? null;
      continue;
    }
    out[clientId] = feeByReviewKey.get(entry.reviewKey) ?? null;
  }
  return out;
}
