import type { ReviewPatchInput } from '@/lib/review/reviewGridDb';

export type GridCell = {
  r: number;
  c: number;
  v?: string | number | boolean | null;
  bg?: string | null;
};

export type GridSheet = {
  name: string;
  minR: number;
  maxR: number;
  minC?: number;
  maxC?: number;
  meta?: Record<string, unknown>;
  cells: GridCell[];
  merges?: { r: number; c: number; rs: number; cs: number }[];
};

export function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

export function cellAt(sheet: GridSheet, r: number, c: number): GridCell | null {
  for (const cell of sheet.cells) {
    if (cell.r === r && cell.c === c) return cell;
  }
  return null;
}

export function applyPatchesToSheet(sheet: GridSheet, patches: ReviewPatchInput[]): GridSheet {
  const relevant = patches.filter(p => p.sheetName === sheet.name);
  if (!relevant.length) return sheet;

  const cellMap = new Map<string, GridCell>();
  for (const cell of sheet.cells) {
    cellMap.set(`${cell.r}:${cell.c}`, { ...cell });
  }

  for (const p of relevant) {
    const key = `${p.r}:${p.c}`;
    const existing = cellMap.get(key) ?? { r: p.r, c: p.c };
    if (p.v === '' || p.v === null || p.v === undefined) {
      delete existing.v;
    } else if (p.v !== undefined) {
      existing.v = p.v as string | number | boolean;
    }
    if (p.bg !== undefined) {
      if (p.bg === null || p.bg === '') delete existing.bg;
      else existing.bg = p.bg;
    }
    cellMap.set(key, existing);
  }

  return { ...sheet, cells: Array.from(cellMap.values()) };
}

export function sliceSheet(sheet: GridSheet, minC: number, maxC: number): GridSheet {
  const cells = sheet.cells.filter(c => c.c >= minC && c.c <= maxC);
  return {
    ...sheet,
    minC,
    maxC,
    cells,
  };
}

export function isSectionMarker(no: unknown, name: unknown): boolean {
  return typeof no === 'string' && /^(기장|성실|신고|업체|상담)/.test(no) && !hasValue(name);
}

function isTotalLabel(v: unknown): boolean {
  if (!hasValue(v) || typeof v !== 'string') return false;
  const s = v.trim();
  return s === '소계' || s === '합계' || s === '총계';
}

export function isIncomeClientRow(no: unknown, name: unknown): boolean {
  if (isSectionMarker(no, name)) return false;
  if (isTotalLabel(no) || isTotalLabel(name)) return false;
  if (!hasValue(name) && typeof no !== 'number') return false;
  return true;
}

export function detectCorpRowKind(company: unknown): 'client' | 'header' | 'subtotal' | 'total' {
  if (!hasValue(company) || typeof company !== 'string') return 'client';
  const s = company.trim();
  if (s === '업체명' || s === '주주명') return 'header';
  if (s === '소계') return 'subtotal';
  if (s === '합계' || s === '총계' || s.includes('합계')) return 'total';
  return 'client';
}

export function isCorpDividendHeaderRow(sheet: GridSheet, r: number): boolean {
  const minC = sheet.minC ?? 1;
  const co = cellAt(sheet, r, minC)?.v;
  const sh = cellAt(sheet, r, minC + 1)?.v;
  return co === '업체명' && sh === '주주명';
}
