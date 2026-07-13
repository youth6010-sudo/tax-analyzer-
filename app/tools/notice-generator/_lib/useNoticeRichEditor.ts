import { useCallback, useEffect, useRef } from 'react';
import { finalizeNoticeHtml, sanitizeNoticeHtml } from './templates';

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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!ref.current || !enabled) return;
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    // 거래처·세목 전환 등 외부 value 변경: 대기 중 debounce emit이 과거값을 덮어쓰지 않게 취소
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
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

  /** DOM 내용을 정리해 상위에 반영. 저장용으로 정리된 HTML을 반환한다. */
  const emit = useCallback(
    (syncDom: boolean): string => {
      if (!ref.current || !enabled) return '';
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // Enter가 <div> 대신 <br>가 되도록 (문장 중간 강제 분리 완화)
      try {
        document.execCommand('defaultParagraphSeparator', false, 'br');
      } catch {
        /* ignore */
      }
      const sanitized = sanitizeNoticeHtml(ref.current.innerHTML);
      const display = finalizeNoticeHtml(sanitized);
      if (syncDom && ref.current.innerHTML !== display) {
        ref.current.innerHTML = display;
      }
      internalChangeRef.current = true;
      onChangeRef.current(sanitized);
      return sanitized;
    },
    [enabled],
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
    try {
      document.execCommand('defaultParagraphSeparator', false, 'br');
    } catch {
      /* ignore */
    }
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
    if (!ref.current || !enabled) return;
    // 세목·거래처 전환 전에 ref/state가 최신이어야 하므로 입력 즉시 동기화 (sanitize는 blur/debounce)
    internalChangeRef.current = true;
    onChangeRef.current(ref.current.innerHTML);
    scheduleDebouncedEmit();
  }, [enabled, scheduleDebouncedEmit]);

  const afterInsert = useCallback(() => {
    if (!ref.current || !enabled) return;
    internalChangeRef.current = true;
    onChangeRef.current(ref.current.innerHTML);
    scheduleDebouncedEmit();
  }, [enabled, scheduleDebouncedEmit]);

  return {
    ref,
    emit,
    handleFocus,
    handleBlur,
    handleInput,
    afterInsert,
  };
}
