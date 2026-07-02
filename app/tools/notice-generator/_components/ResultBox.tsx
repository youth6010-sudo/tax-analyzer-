import { useEffect, useRef, useState } from 'react';
import { htmlToPlainText, normalizeHtmlForClipboard, sanitizeNoticeHtml } from '../_lib/templates';

type Props = {
  messageHtml: string;
  title?: string;
  /** true면 생성된 문구를 직접 수정할 수 있는 편집 버튼을 노출 */
  editable?: boolean;
};

export default function ResultBox({
  messageHtml,
  title = '생성된 안내 문구 (서식 유지)',
  editable = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);

  // 직접 수정값(null이면 자동 생성 문구 사용). 입력값이 바뀌면 자동 생성본을 따라가되,
  // 사용자가 직접 고친 경우엔 그 값을 유지하고 '재생성' 버튼으로 되돌릴 수 있게 한다.
  const [edited, setEdited] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastMessageHtml = useRef(messageHtml);

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

  const effectiveHtml = edited ?? messageHtml;
  const isDirty = edited !== null && edited !== messageHtml;

  // 편집 모드 진입 시 현재 문구를 1회 주입 (입력 중 커서 튐 방지)
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = sanitizeNoticeHtml(effectiveHtml || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const emitEdit = () => {
    if (!editorRef.current) return;
    const sanitized = sanitizeNoticeHtml(editorRef.current.innerHTML);
    if (editorRef.current.innerHTML !== sanitized) {
      editorRef.current.innerHTML = sanitized;
    }
    setEdited(sanitized);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const next = html
      ? sanitizeNoticeHtml(html)
      : sanitizeNoticeHtml(text.replace(/\n/g, '<br>'));
    document.execCommand('insertHTML', false, next);
    emitEdit();
  };

  const resetToGenerated = () => {
    setEdited(null);
    setEditing(false);
  };

  const toggleEdit = () => {
    if (editing) {
      emitEdit();
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

  // 서식 유지 복사: text/html + text/plain 동시 기록
  const copyRich = async () => {
    if (!effectiveHtml) return;
    const richHtml = normalizeHtmlForClipboard(effectiveHtml);
    const plain = htmlToPlainText(effectiveHtml);
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
    if (!effectiveHtml) return;
    const plain = htmlToPlainText(effectiveHtml);
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

  return (
    <section className="rounded-3xl border border-white bg-white/80 p-4 shadow-[0_12px_36px_-14px_rgba(244,114,182,0.45)] backdrop-blur-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-rose-200 text-sm">
            💌
          </span>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {editable && (
            <button
              type="button"
              onClick={toggleEdit}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
                editing
                  ? 'bg-violet-500 text-white'
                  : 'border border-violet-200 bg-white text-violet-600 hover:bg-violet-50',
              ].join(' ')}
            >
              {editing ? '편집 완료 ✓' : '✏️ 편집'}
            </button>
          )}
          {editable && isDirty && !editing && (
            <button
              type="button"
              onClick={resetToGenerated}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 active:scale-95"
            >
              재생성
            </button>
          )}
          <button
            type="button"
            onClick={copyPlain}
            disabled={!effectiveHtml}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
              !effectiveHtml
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : copiedPlain
                  ? 'bg-emerald-500 text-white'
                  : 'border border-rose-200 bg-white text-slate-600 hover:bg-rose-50',
            ].join(' ')}
          >
            {copiedPlain ? '복사됨 ✓' : '텍스트만 복사'}
          </button>
          <button
            type="button"
            onClick={copyRich}
            disabled={!effectiveHtml}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95',
              !effectiveHtml
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gradient-to-r from-rose-400 to-pink-400 text-white shadow-md shadow-rose-200/60 hover:from-rose-500 hover:to-pink-500',
            ].join(' ')}
          >
            {copied ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
                복사됨
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
                서식 유지 복사
              </>
            )}
          </button>
        </div>
      </div>

      {editing ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitEdit}
          onBlur={emitEdit}
          onPaste={handlePaste}
          className="notice-preview min-h-[260px] w-full overflow-auto rounded-2xl border border-violet-200 bg-white p-4 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
        />
      ) : (
        <div
          className="notice-preview min-h-[260px] w-full overflow-auto rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/40 to-white p-4 text-sm leading-relaxed text-slate-800"
          dangerouslySetInnerHTML={{ __html: effectiveHtml }}
        />
      )}
      {editable && editing ? (
        <p className="mt-2 text-[11px] text-violet-500">
          문구를 직접 고친 뒤 ‘편집 완료’를 누르세요. 입력값(금액·납부서)이 바뀌면 ‘재생성’으로 자동 문구로 되돌릴 수 있습니다.
        </p>
      ) : editable && isDirty ? (
        <p className="mt-2 text-[11px] text-amber-600">
          직접 수정한 문구입니다. 입력값이 바뀌어도 자동 갱신되지 않으니, 필요하면 ‘재생성’을 누르세요.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">
          ‘서식 유지 복사’는 한글/워드/메일/카페 글 등 서식 편집기에 붙여넣을 때
          색상·이모지·줄간격이 그대로 유지됩니다. 카카오톡 등 일반 메신저는 ‘텍스트만
          복사’를 사용하세요.
        </p>
      )}
    </section>
  );
}
