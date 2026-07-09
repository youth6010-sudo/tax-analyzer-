'use client';

import { useCallback } from 'react';
import {
  noticeFieldToHtml,
  prepareNoticePasteContent,
} from '../_lib/templates';
import { useNoticeRichEditor } from '../_lib/useNoticeRichEditor';
import { noticeTextarea } from './noticeUi';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
};

function fieldIsEmpty(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  return !text;
}

export default function NoticeRichTextField({
  value,
  onChange,
  placeholder,
  rows = 5,
  className = '',
}: Props) {
  const toEditorHtml = useCallback((v: string) => noticeFieldToHtml(v), []);

  const { ref, handleFocus, handleBlur, handleInput, afterInsert } =
    useNoticeRichEditor({
      value,
      onChange,
      toEditorHtml,
    });

  const updateEmptyState = () => {
    if (!ref.current) return;
    ref.current.dataset.empty = fieldIsEmpty(ref.current) ? 'true' : 'false';
  };

  const insertSanitizedContent = (html: string, plain: string) => {
    const next = prepareNoticePasteContent(html, plain);
    if (!next) return;
    document.execCommand('insertHTML', false, next);
    updateEmptyState();
    afterInsert();
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty="true"
      onFocus={handleFocus}
      onInput={() => {
        updateEmptyState();
        handleInput();
      }}
      onBlur={() => {
        updateEmptyState();
        handleBlur();
      }}
      onPaste={e => {
        e.preventDefault();
        insertSanitizedContent(
          e.clipboardData.getData('text/html'),
          e.clipboardData.getData('text/plain'),
        );
      }}
      onDrop={e => {
        e.preventDefault();
        insertSanitizedContent(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
      }}
      onDragOver={e => e.preventDefault()}
      className={[
        noticeTextarea,
        'notice-rich-field mt-1 w-full outline-none',
        'data-[empty=true]:not(:focus):before:pointer-events-none',
        'data-[empty=true]:not(:focus):before:text-slate-400',
        "data-[empty=true]:not(:focus):before:content-[attr(data-placeholder)]",
        className,
      ].join(' ')}
      style={{ minHeight: `${rows * 1.35}rem` }}
    />
  );
}
