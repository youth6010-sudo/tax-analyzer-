import { useCallback, useEffect, useRef } from 'react';
import { sanitizeNoticeHtml } from './templates';

type Options = {
  value: string;
  onChange: (value: string) => void;
  toEditorHtml: (value: string) => string;
  enabled?: boolean;
  /** 미리보기·자동저장용 — DOM은 건드리지 않고 상위 state만 갱신 */
  debounceMs?: number;
};

/** contentEditable — 입력 중 undo 보존, blur 시 서식 정리 */
export function useNoticeRichEditor({
  value,
  onChange,
  toEditorHtml,
  enabled = true,
  debounceMs = 600,
}: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const internalChangeRef = useRef(false);
  const focusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ref.current || !enabled || focusedRef.current) return;
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    const html = toEditorHtml(value || '');
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [value, enabled, toEditorHtml]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const emit = useCallback(
    (syncDom: boolean) => {
      if (!ref.current || !enabled) return;
      const sanitized = sanitizeNoticeHtml(ref.current.innerHTML);
      if (syncDom && ref.current.innerHTML !== sanitized) {
        ref.current.innerHTML = sanitized;
      }
      internalChangeRef.current = true;
      onChange(sanitized);
    },
    [enabled, onChange],
  );

  const scheduleDebouncedEmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (focusedRef.current) emit(false);
    }, debounceMs);
  }, [debounceMs, emit]);

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    emit(true);
  }, [emit]);

  const handleInput = useCallback(() => {
    scheduleDebouncedEmit();
  }, [scheduleDebouncedEmit]);

  const afterInsert = useCallback(() => {
    scheduleDebouncedEmit();
  }, [scheduleDebouncedEmit]);

  return {
    ref,
    emit,
    handleFocus,
    handleBlur,
    handleInput,
    afterInsert,
  };
}
