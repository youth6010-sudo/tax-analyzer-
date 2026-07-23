'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  finalizeNoticeHtml,
  htmlToPlainText,
  normalizeHtmlForClipboard,
  prepareNoticePasteContent,
} from '../_lib/templates';
import { useNoticeRichEditor } from '../_lib/useNoticeRichEditor';
import {
  noticeBtnPrimary,
  noticeBtnSecondary,
  noticeSection,
  noticeSectionTitle,
} from './noticeUi';

type Props = {
  messageHtml: string;
  title?: string;
  editable?: boolean;
  compact?: boolean;
  embedded?: boolean;
};

export default function ResultBox({
  messageHtml,
  title = '생성된 안내 문구',
  editable = false,
  compact = false,
  embedded = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const lastMessageHtml = useRef(messageHtml);

  const effectiveHtml = edited ?? messageHtml;
  // 미리보기·서식 복사 동일 HTML
  const displayHtml = finalizeNoticeHtml(effectiveHtml);
  const toEditorHtml = useCallback((v: string) => finalizeNoticeHtml(v), []);

  const { ref: editorRef, handleFocus, handleBlur, handleInput, afterInsert, emit } =
    useNoticeRichEditor({
      value: displayHtml,
      onChange: (html: string) => {
        // 빈 문자열로 덮어쓰지 않음 (blur/버튼 포커스 경합 방지)
        if (!html.trim()) return;
        setEdited(html);
      },
      toEditorHtml,
      enabled: editing,
    });

  useEffect(() => {
    if (editing) return;
    // 원본(자동생성) HTML이 바뀌어도 사용자가 편집한 내용은 유지.
    // 편집 내용이 「재생성」으로 비워진 경우(null)에만 기준값을 갱신.
    if (edited === null) {
      lastMessageHtml.current = messageHtml;
    }
  }, [messageHtml, edited, editing]);

  const isDirty = edited !== null && edited !== messageHtml;
  const previewMinH = compact ? 'min-h-[8rem]' : 'min-h-[12rem]';

  const insertSanitizedContent = (html: string, plain: string) => {
    const next = prepareNoticePasteContent(html, plain);
    if (!next) return;
    document.execCommand('insertHTML', false, next);
    afterInsert();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertSanitizedContent(
      e.clipboardData.getData('text/html'),
      e.clipboardData.getData('text/plain'),
    );
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertSanitizedContent(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const resetToGenerated = () => {
    setEdited(null);
    setEditing(false);
  };

  const toggleEdit = () => {
    if (editing) {
      const next = emit(true);
      if (next.trim()) setEdited(next);
      setEditing(false);
    } else {
      setEditing(true);
    }
  };

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1800);
  };

  const legacyCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };

  const copyRich = async () => {
    if (!displayHtml) return;
    // 한글·워드용: margin:0 문단으로 변환해 붙여넣기 여분 줄 방지
    const richHtml = normalizeHtmlForClipboard(displayHtml);
    const plain = htmlToPlainText(displayHtml);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': new Blob([richHtml], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(plain);
      } else {
        legacyCopy(plain);
      }
      flash(setCopied);
    } catch {
      legacyCopy(plain);
      flash(setCopied);
    }
  };

  const copyPlain = async () => {
    if (!displayHtml) return;
    const plain = htmlToPlainText(displayHtml);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(plain);
      } else {
        legacyCopy(plain);
      }
      flash(setCopiedPlain);
    } catch {
      legacyCopy(plain);
      flash(setCopiedPlain);
    }
  };

  const body = (
    <>
      <div
        className={`flex flex-wrap items-center gap-2 ${embedded ? 'mb-2 justify-end' : 'mb-2 justify-between'}`}
      >
        {!embedded && <h2 className={noticeSectionTitle}>{title}</h2>}
        <div className="flex flex-wrap items-center gap-1.5">
          {editable && (
            <button
              type="button"
              onClick={toggleEdit}
              className={[
                noticeBtnSecondary,
                '!px-2.5 !py-1 text-xs',
                editing ? 'border-blue-300 bg-blue-50 text-blue-900' : '',
              ].join(' ')}
            >
              {editing ? '편집 완료' : '편집'}
            </button>
          )}
          {editable && isDirty && !editing && (
            <button
              type="button"
              onClick={resetToGenerated}
              className={`${noticeBtnSecondary} !px-2.5 !py-1 text-xs`}
            >
              재생성
            </button>
          )}
          <button
            type="button"
            onClick={copyPlain}
            disabled={!displayHtml}
            className={`${noticeBtnSecondary} !px-2.5 !py-1 text-xs disabled:opacity-50`}
          >
            {copiedPlain ? '복사됨' : '텍스트'}
          </button>
          <button
            type="button"
            onClick={copyRich}
            disabled={!displayHtml}
            className={`${noticeBtnPrimary} !px-2.5 !py-1 text-xs disabled:opacity-50`}
          >
            {copied ? '복사됨' : '서식 복사'}
          </button>
        </div>
      </div>

      {/* 편집/미리보기 동일 DOM — 재편집 시 내용 유지 (dangerouslySetInnerHTML 사용 안 함) */}
      <div
        ref={editorRef}
        contentEditable={editing}
        suppressContentEditableWarning
        onFocus={editing ? handleFocus : undefined}
        onInput={editing ? handleInput : undefined}
        onBlur={editing ? handleBlur : undefined}
        onPaste={editing ? handlePaste : undefined}
        onDrop={editing ? handleDrop : undefined}
        onDragOver={editing ? handleDragOver : undefined}
        className={`notice-preview ${previewMinH} w-full overflow-auto rounded-lg border p-3 text-sm text-slate-800 outline-none ${
          editing
            ? 'border-blue-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
            : 'border-slate-200 bg-slate-50/80'
        }`}
      />
      {!compact && !embedded && (
        <p className="mt-1.5 text-[10px] text-slate-400">
          서식 복사: 한글·워드·메일 · 텍스트: 카카오톡 등 · 편집: Ctrl+B/I/U/Z/Y
        </p>
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <section className={noticeSection}>{body}</section>;
}
