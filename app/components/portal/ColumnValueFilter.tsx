'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** 빈 값(미입력) 필터 키 */
export const COLUMN_FILTER_EMPTY = '__empty__';

export type ColumnFilterOption = {
  key: string;
  label: string;
  count: number;
};

export type ColumnFilterMap = Record<string, Set<string> | null>;

export function normalizeColumnFilterValue(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v ? v : COLUMN_FILTER_EMPTY;
}

export function defaultColumnFilterLabel(key: string): string {
  return key === COLUMN_FILTER_EMPTY ? '미입력' : key;
}

export function buildColumnFilterOptions(
  values: Iterable<string | null | undefined>,
  opts?: {
    labelOf?: (key: string) => string;
    sortKeys?: (a: string, b: string) => number;
  },
): ColumnFilterOption[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const k = normalizeColumnFilterValue(raw);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const keys = [...counts.keys()];
  const sortKeys =
    opts?.sortKeys ??
    ((a: string, b: string) => {
      if (a === COLUMN_FILTER_EMPTY) return -1;
      if (b === COLUMN_FILTER_EMPTY) return 1;
      return a.localeCompare(b, 'ko');
    });
  keys.sort(sortKeys);
  const labelOf = opts?.labelOf ?? defaultColumnFilterLabel;
  return keys.map(k => ({ key: k, label: labelOf(k), count: counts.get(k) ?? 0 }));
}

export function toggleColumnFilterValue(
  prev: Set<string> | null,
  key: string,
  allKeys: string[],
): Set<string> | null {
  const next = new Set(prev ?? allKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  if (allKeys.length > 0 && allKeys.every(k => next.has(k))) return null;
  return next;
}

export function matchesColumnFilter(
  filter: Set<string> | null | undefined,
  value: string | null | undefined,
): boolean {
  if (!filter) return true;
  return filter.has(normalizeColumnFilterValue(value));
}

export function rowMatchesColumnFilters(
  filters: ColumnFilterMap,
  valuesByColumn: Record<string, string | null | undefined>,
): boolean {
  for (const [col, filter] of Object.entries(filters)) {
    if (!filter) continue;
    if (!matchesColumnFilter(filter, valuesByColumn[col])) return false;
  }
  return true;
}

export function useColumnFilters(resetKey?: string | number) {
  const [filters, setFilters] = useState<ColumnFilterMap>({});
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setFilters({});
    setOpenKey(null);
  }, [resetKey]);

  const toggleOpen = useCallback((key: string) => {
    setOpenKey(prev => (prev === key ? null : key));
  }, []);

  const clear = useCallback((key: string) => {
    setFilters(prev => {
      if (!(key in prev) || prev[key] == null) return prev;
      const next = { ...prev };
      next[key] = null;
      return next;
    });
    setOpenKey(null);
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
    setOpenKey(null);
  }, []);

  const toggleValue = useCallback((col: string, key: string, allKeys: string[]) => {
    setFilters(prev => ({
      ...prev,
      [col]: toggleColumnFilterValue(prev[col] ?? null, key, allKeys),
    }));
  }, []);

  const isActive = useCallback(
    (col: string) => {
      const f = filters[col];
      return Boolean(f && f.size > 0);
    },
    [filters],
  );

  const anyActive = useMemo(
    () => Object.values(filters).some(f => f != null && f.size > 0),
    [filters],
  );

  return {
    filters,
    openKey,
    setOpenKey,
    toggleOpen,
    clear,
    clearAll,
    toggleValue,
    isActive,
    anyActive,
  };
}

const FILTER_MENU_WIDTH = 208; // w-52

export function ColumnFilterMenu({
  columnKey,
  title,
  options,
  filter,
  open,
  onToggleOpen,
  onToggleValue,
  onClear,
  align = 'center',
}: {
  columnKey: string;
  title: string;
  options: ColumnFilterOption[];
  filter: Set<string> | null | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onToggleValue: (key: string) => void;
  onClear: () => void;
  align?: 'left' | 'center' | 'right';
}) {
  const [q, setQ] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const active = Boolean(filter && filter.size > 0);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left =
        align === 'right'
          ? r.right - FILTER_MENU_WIDTH
          : align === 'left'
            ? r.left
            : r.left + r.width / 2 - FILTER_MENU_WIDTH / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - FILTER_MENU_WIDTH - 8));
      setPos({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, align]);

  const visibleOptions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      o => o.label.toLowerCase().includes(needle) || o.key.toLowerCase().includes(needle),
    );
  }, [options, q]);

  const menu =
    open && pos
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[100]" onClick={onToggleOpen} />
            <div
              className="fixed z-[110] w-52 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-lg"
              style={{ top: pos.top, left: pos.left }}
              onClick={e => e.stopPropagation()}
            >
              <p className="mb-1 px-2 text-[10px] font-bold text-slate-500">{title}</p>
              <button
                type="button"
                onClick={onClear}
                className={`mb-1 block w-full rounded px-2 py-1 text-left text-[11px] font-medium hover:bg-slate-100 ${
                  active ? 'text-slate-600' : 'bg-blue-50 text-blue-700'
                }`}
              >
                전체 표시
              </button>
              {options.length > 8 ? (
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="값 검색…"
                  className="mb-1 w-full rounded border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400"
                />
              ) : null}
              <div className="max-h-56 space-y-0.5 overflow-y-auto border-t border-slate-100 pt-1">
                {visibleOptions.map(opt => {
                  const checked = filter ? filter.has(opt.key) : true;
                  return (
                    <label
                      key={opt.key}
                      className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] font-normal text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleValue(opt.key)}
                        className="h-3 w-3 accent-blue-600"
                      />
                      <span className="min-w-0 flex-1 truncate" title={opt.label}>
                        {opt.label}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{opt.count}</span>
                    </label>
                  );
                })}
                {visibleOptions.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] font-normal text-slate-400">표시할 값이 없습니다.</p>
                ) : null}
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        title={`${title} 값 필터`}
        onClick={e => {
          e.stopPropagation();
          onToggleOpen();
        }}
        className={`rounded px-0.5 text-[10px] leading-none hover:bg-slate-200 ${
          active ? 'text-blue-600' : 'text-slate-400'
        }`}
      >
        ▼
        <span className="sr-only">{columnKey}</span>
      </button>
      {menu}
    </span>
  );
}

export function ColumnValueFilterHeader({
  columnKey,
  label,
  options,
  filter,
  open,
  onToggleOpen,
  onToggleValue,
  onClear,
  align = 'center',
  subtitle,
  className = '',
  extraMenus,
}: {
  columnKey: string;
  label: ReactNode;
  options: ColumnFilterOption[];
  filter: Set<string> | null | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onToggleValue: (key: string) => void;
  onClear: () => void;
  align?: 'left' | 'center' | 'right';
  subtitle?: ReactNode;
  className?: string;
  extraMenus?: ReactNode;
}) {
  const active = Boolean(filter && filter.size > 0);
  const alignCls =
    align === 'left' ? 'justify-start text-left' : align === 'right' ? 'justify-end text-right' : 'justify-center text-center';

  return (
    <th
      className={`sticky top-0 z-20 relative whitespace-nowrap bg-slate-50 px-2 py-2 font-semibold shadow-[0_1px_0_0_#e2e8f0] ${className}`}
    >
      <span className={`flex flex-wrap items-center gap-0.5 ${alignCls}`}>
        <span>{label}</span>
        <ColumnFilterMenu
          columnKey={columnKey}
          title={typeof label === 'string' ? label : columnKey}
          options={options}
          filter={filter}
          open={open}
          onToggleOpen={onToggleOpen}
          onToggleValue={onToggleValue}
          onClear={onClear}
          align={align}
        />
        {extraMenus}
      </span>
      {subtitle ? (
        <span className="mt-0.5 block text-[9px] font-normal tabular-nums text-blue-600">{subtitle}</span>
      ) : null}
      {active ? null : null}
    </th>
  );
}
