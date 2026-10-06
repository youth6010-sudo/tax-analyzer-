'use client';

import {
  useCallback,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/** 열 키 → px 너비. null = 기본(자동) 레이아웃 */
type Widths = Record<string, number>;

const MIN_WIDTH = 40;
const FALLBACK_WIDTH = 100;

const listeners = new Set<() => void>();
/** useSyncExternalStore 스냅샷은 같은 값이면 같은 객체여야 함 */
const cache = new Map<string, { raw: string | null; value: Widths | null }>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

function readWidths(key: string): Widths | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: Widths | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object') {
      const entries = Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0,
      );
      if (entries.length) {
        value = Object.fromEntries(entries.map(([k, v]) => [k, Math.max(MIN_WIDTH, Math.round(v))]));
      }
    }
  } catch {
    value = null;
  }
  cache.set(key, { raw, value });
  return value;
}

function writeWidths(key: string, value: Widths | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    /* 저장 불가(사생활 모드 등)면 무시 */
  }
  listeners.forEach(l => l());
}

/**
 * 표 열 너비를 사용자가 드래그로 조절 — 브라우저(localStorage)별 저장.
 * 조절 전에는 기존 자동 레이아웃 그대로, 처음 드래그할 때 현재 너비를 재서 고정 레이아웃으로 전환.
 * table에 `style={tableStyle}`, 각 th에 `{...thProps(key)}`, 안에 `{handle(key)}` — th는 position 지정(relative 등) 필요.
 */
export function useColumnWidths(storageKey: string, columns: readonly string[]) {
  const widths = useSyncExternalStore(
    subscribe,
    () => readWidths(storageKey),
    () => null,
  );

  const reset = useCallback(() => writeWidths(storageKey, null), [storageKey]);

  const startResize = useCallback(
    (col: string, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const measured: Widths = {};
      e.currentTarget.closest('table')?.querySelectorAll<HTMLElement>('thead th[data-col]').forEach(th => {
        const key = th.dataset.col;
        if (key) measured[key] = Math.round(th.getBoundingClientRect().width);
      });
      const base: Widths = { ...measured, ...readWidths(storageKey) };
      const startX = e.clientX;
      const startW = base[col] ?? FALLBACK_WIDTH;
      let pending: Widths | null = null;
      let frame = 0;
      const onMove = (ev: PointerEvent) => {
        pending = { ...base, [col]: Math.max(MIN_WIDTH, Math.round(startW + ev.clientX - startX)) };
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (pending) writeWidths(storageKey, pending);
          });
        }
      };
      const onUp = () => {
        cancelAnimationFrame(frame);
        if (pending) writeWidths(storageKey, pending);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [storageKey],
  );

  const tableStyle: CSSProperties | undefined = widths
    ? {
        tableLayout: 'fixed',
        width: columns.reduce((sum, c) => sum + (widths[c] ?? FALLBACK_WIDTH), 0),
        minWidth: 0,
      }
    : undefined;

  const thProps = (col: string) => ({
    'data-col': col,
    style: widths ? { width: widths[col] ?? FALLBACK_WIDTH, minWidth: 0 } : undefined,
  });

  const handle = (col: string) => (
    <span
      aria-hidden
      title="드래그: 열 너비 조절 · 더블클릭: 열 너비 초기화"
      onPointerDown={e => startResize(col, e)}
      onDoubleClick={e => {
        e.stopPropagation();
        reset();
      }}
      onClick={e => e.stopPropagation()}
      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none hover:bg-blue-400/50 active:bg-blue-500/60 print:hidden"
    />
  );

  return {
    tableStyle,
    /** 조절된 상태 — 셀 내용이 넘치면 잘라냄 */
    customized: !!widths,
    thProps,
    handle,
    reset,
  };
}
