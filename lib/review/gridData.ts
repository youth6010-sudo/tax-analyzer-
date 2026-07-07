import fs from 'fs';
import path from 'path';

import {
  getReviewGridMetaFromDb,
  hasReviewGridSheetsInDb,
  readReviewGridSheetsFromDb,
} from '@/lib/review/gridSheetDb';

const GRID_PATH = path.join(process.cwd(), 'public', 'data', 'review-grid.json');

type ReviewGridFile = {
  version?: string;
  source?: string;
  importedAt?: string;
  sheets?: unknown[];
};

let gridFileCache: { mtimeMs: number; data: ReviewGridFile } | null = null;

export function getReviewGridPath(): string {
  return GRID_PATH;
}

export function hasReviewGridFile(): boolean {
  return fs.existsSync(GRID_PATH);
}

export function readReviewGridFile(): ReviewGridFile {
  if (!hasReviewGridFile()) {
    throw new Error('review-grid.json not found. Run npm run import:review');
  }
  const stat = fs.statSync(GRID_PATH);
  if (gridFileCache && gridFileCache.mtimeMs === stat.mtimeMs) {
    return gridFileCache.data;
  }
  const raw = fs.readFileSync(GRID_PATH, 'utf8');
  const data = JSON.parse(raw) as ReviewGridFile;
  gridFileCache = { mtimeMs: stat.mtimeMs, data };
  return data;
}

function readReviewGridSheetsFromFile(names: string[]) {
  const data = readReviewGridFile();
  const want = new Set(names.filter(Boolean));
  const sheets = Array.isArray(data.sheets)
    ? data.sheets.filter((s): s is { name: string } => {
        const n = (s as { name?: string }).name;
        return !!n && want.has(n);
      })
    : [];
  return {
    version: data.version ?? null,
    source: data.source ?? null,
    importedAt: data.importedAt ?? null,
    sheets,
  };
}

/** Supabase(Postgres) 우선, 없으면 review-grid.json */
export async function readReviewGridSheets(names: string[]) {
  if (await hasReviewGridSheetsInDb()) {
    const meta = await getReviewGridMetaFromDb();
    const sheets = await readReviewGridSheetsFromDb(names);
    return {
      version: meta?.version ?? null,
      source: meta?.source ?? null,
      importedAt: meta?.importedAt ?? null,
      sheets,
      fromDb: true,
    };
  }
  return { ...readReviewGridSheetsFromFile(names), fromDb: false };
}

export function getReviewGridMeta() {
  if (!hasReviewGridFile()) {
    return {
      version: null,
      source: null,
      importedAt: null,
      sheetCount: 0,
      missing: true,
    };
  }

  try {
    const data = readReviewGridFile();
    return {
      version: data.version ?? null,
      source: data.source ?? null,
      importedAt: data.importedAt ?? null,
      sheetCount: Array.isArray(data.sheets) ? data.sheets.length : 0,
      missing: false,
    };
  } catch {
    return {
      version: null,
      source: null,
      importedAt: null,
      sheetCount: 0,
      missing: true,
    };
  }
}

export async function getReviewGridMetaAsync() {
  const dbMeta = await getReviewGridMetaFromDb();
  if (dbMeta) return { ...dbMeta, fromDb: true };
  return { ...getReviewGridMeta(), fromDb: false };
}

export async function isReviewGridReady(): Promise<boolean> {
  if (await hasReviewGridSheetsInDb()) return true;
  return hasReviewGridFile();
}
