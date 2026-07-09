import { useCallback, useState } from 'react';
import { TOKENS, type TemplateSource, type TemplateToken } from '../_lib/template';
import { sanitizeNoticeHtml, prepareNoticePasteContent } from '../_lib/templates';
import { NOTICE_EDITOR_SHORTCUT_HINT } from '../_lib/noticeEditorShortcuts';
import { useNoticeRichEditor } from '../_lib/useNoticeRichEditor';
import { TemplateSourceToggle } from './TemplateSourceToggle';
import {
  noticeBtnSecondary,
  noticeSectionCompact,
  noticeSectionTitle,
  noticeTextarea,
} from './noticeUi';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type Props = {
  html: string;
  onChange: (html: string) => void;
  source: TemplateSource;
  onSourceChange: (source: TemplateSource) => void;
  onSave: () => void;
  hasCustomSaved: boolean;
  saveState?: SaveState;
  title?: string;
  defaultHtml?: string;
  tokens?: TemplateToken[];
  hint?: string;
};

export default function TemplateEditor({
  html,
  onChange,
  source,
  onSourceChange,
  onSave,
  hasCustomSaved,
  saveState = 'idle',
  title = '안내문 서식 (외부 서식 붙여넣기)',
  defaultHtml = '',
  tokens = TOKENS,
  hint,
}: Props) {
  const [open, setOpen] = useState(true);
  const isCustom = source === 'custom';
  const displayHtml = isCustom ? html : defaultHtml;
  const toEditorHtml = useCallback((v: string) => sanitizeNoticeHtml(v || ''), []);

  const { ref, handleFocus, handleBlur, handleInput, afterInsert } =
    useNoticeRichEditor({
      value: html,
      onChange,
      toEditorHtml,
      enabled: isCustom,
    });

  const insertSanitizedContent = (html: string, plain: string) => {
    const next = prepareNoticePasteContent(html, plain);
    if (!next) return;
    document.execCommand('insertHTML', false, next);
    afterInsert();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!isCustom) return;
    e.preventDefault();
    insertSanitizedContent(
      e.clipboardData.getData('text/html'),
      e.clipboardData.getData('text/plain'),
    );
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isCustom) return;
    e.preventDefault();
    insertSanitizedContent(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isCustom) return;
    e.preventDefault();
  };

  const insertToken = (token: string) => {
    if (!isCustom) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const ok = document.execCommand('insertText', false, token);
    if (!ok) {
      el.innerHTML += token;
    }
    afterInsert();
  };

  const loadDefaultIntoCustom = () => {
    onChange(defaultHtml);
    onSourceChange('custom');
  };

  return (
    <section className={noticeSectionCompact}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className={noticeSectionTitle}>{title}</h3>
        <span className="text-xs text-slate-500">{open ? '접기' : '펼치기'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <TemplateSourceToggle
            source={source}
            onSourceChange={onSourceChange}
            hasCustom={hasCustomSaved}
            onSave={onSave}
            saveState={saveState}
          />

          <p className="text-xs text-slate-500">
            {hint ??
              (isCustom
                ? '쓰시던 안내문을 복사해 붙여넣고 토큰을 넣으세요. 편집 후 「내 서식 저장」을 누르면 담당자 계정에 저장됩니다.'
                : '기본 서식이 적용됩니다. 「내 서식」으로 바꾸면 편집·저장할 수 있습니다.')}
          </p>

          {isCustom && (
            <div className="flex flex-wrap gap-1.5">
              {tokens.map(t => (
                <button
                  key={t.token}
                  type="button"
                  title={t.desc}
                  onClick={() => insertToken(t.token)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-blue-700 transition hover:bg-white"
                >
                  {t.token}
                </button>
              ))}
            </div>
          )}

          {isCustom ? (
            <div
              ref={ref}
              contentEditable
              suppressContentEditableWarning
              onFocus={handleFocus}
              onInput={handleInput}
              onBlur={handleBlur}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`${noticeTextarea} min-h-[120px] !text-sm`}
            />
          ) : (
            <div
              className="notice-preview min-h-[100px] w-full overflow-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-700"
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {isCustom
                ? `※ 붙여넣기·드래그 시 색·배경은 제거됩니다. ${NOTICE_EDITOR_SHORTCUT_HINT}`
                : '※ 기본 서식은 읽기 전용입니다.'}
            </span>
            {isCustom && (
              <button
                type="button"
                onClick={loadDefaultIntoCustom}
                className={`${noticeBtnSecondary} !px-2.5 !py-1 text-xs`}
              >
                기본 서식 불러오기
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
