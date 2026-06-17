import {
  LEFT_COLUMN_LABELS,
  RIGHT_COLUMN_LABELS,
} from '@/app/utils/clientsGrouping';

export type CategoryColumnSide = 'left' | 'right';

const STORAGE_KEY = 'tax-analyzer:clients-column-layout';

export function getDefaultCategorySide(category: string): CategoryColumnSide {
  if (LEFT_COLUMN_LABELS.has(category)) return 'left';
  if (RIGHT_COLUMN_LABELS.has(category)) return 'right';
  return 'left';
}

export function readColumnLayout(): Record<string, CategoryColumnSide> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Record<string, CategoryColumnSide> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === 'left' || value === 'right') out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function writeColumnLayout(layout: Record<string, CategoryColumnSide>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export function clearColumnLayout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function resolveCategorySide(
  category: string,
  layout: Record<string, CategoryColumnSide> | null,
): CategoryColumnSide {
  return layout?.[category] ?? getDefaultCategorySide(category);
}

export function hasCustomColumnLayout(
  layout: Record<string, CategoryColumnSide> | null,
  categories: string[],
): boolean {
  if (!layout) return false;
  return categories.some(cat => layout[cat] !== undefined && layout[cat] !== getDefaultCategorySide(cat));
}

export function moveCategoryToColumn(
  layout: Record<string, CategoryColumnSide> | null,
  category: string,
  side: CategoryColumnSide,
): Record<string, CategoryColumnSide> {
  const next = { ...(layout ?? {}) };
  if (resolveCategorySide(category, null) === side) {
    delete next[category];
  } else {
    next[category] = side;
  }
  if (Object.keys(next).length === 0) {
    clearColumnLayout();
    return {};
  }
  writeColumnLayout(next);
  return next;
}
