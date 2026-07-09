import { useCallback, useEffect, useRef, useState } from 'react';
import { htmlToPlainText, normalizeHtmlForClipboard, prepareNoticePasteContent, sanitizeNoticeHtml } from '../_lib/templates';
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
  const displayHtml = sanitizeNoticeHtml(effectiveHtml);
  const toEditorHtml = useCallback((v: string) => sanitizeNoticeHtml(v), []);

  const { ref: editorRef, handleFocus, handleBlur, handleInput, afterInsert, emit } =
    useNoticeRichEditor({
      value: effectiveHtml,
      onChange: (html: string) => setEdited(html),
      toEditorHtml,
      enabled: editing,
    });

  useEffect(() => {
    if (editing) return;
    if (edited === null) {
      lastMessageHtml.current = messageHtml;
      return;
    }
    if (edited === lastMessageHtml.current) {
      setEdited(null);
    }
    lastMessageHtml.current = messageHtml;
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
      emit(true);
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

      {editing ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={handleFocus}
          onInput={handleInput}
          onBlur={handleBlur}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`notice-preview ${previewMinH} w-full overflow-auto rounded-lg border border-blue-200 bg-white p-3 text-sm leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20`}
        />
      ) : (
        <div
          className={`notice-preview ${previewMinH} w-full overflow-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-800`}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      )}
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
