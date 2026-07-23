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
  const wasEnabledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!ref.current) return;

    // 미리보기 모드에서도 value를 DOM에 반영 (동일 노드 유지)
    if (!enabled) {
      internalChangeRef.current = false;
      wasEnabledRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const html = toEditorHtml(value || '');
      if (ref.current.innerHTML !== html) {
        ref.current.innerHTML = html;
      }
      return;
    }

    const justEnabled = !wasEnabledRef.current;
    wasEnabledRef.current = true;

    // 입력 중 자체 onChange로 value가 바뀐 경우는 DOM을 다시 쓰지 않음
    // 단, 편집 모드에 막 들어온 경우에는 반드시 내용을 채움
    if (internalChangeRef.current && !justEnabled) {
      internalChangeRef.current = false;
      return;
    }
    internalChangeRef.current = false;

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
      try {
        document.execCommand('defaultParagraphSeparator', false, 'br');
      } catch {
        /* ignore */
      }
      const raw = ref.current.innerHTML;
      if (!raw.trim()) return '';
      const sanitized = sanitizeNoticeHtml(raw);
      if (!sanitized.trim()) return '';
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
