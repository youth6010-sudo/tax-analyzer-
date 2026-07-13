'use client';

import { useCallback, useState } from 'react';
import { TOKENS, type TemplateSource, type TemplateToken } from '../_lib/template';
import { finalizeNoticeHtml, prepareNoticePasteContent } from '../_lib/templates';
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
  /** 저장 시 에디터에서 flush한 HTML을 넘김 (옛 state 저장 방지) */
  onSave: (html?: string) => void;
  hasCustomSaved: boolean;
  saveState?: SaveState;
  title?: string;
  defaultHtml?: string;
  tokens?: TemplateToken[];
  hint?: string;
  /** 리아 관리자 모드 — 기본 서식 탭에서 바로 편집·저장 */
  canEditDefault?: boolean;
  onDefaultChange?: (html: string) => void;
  onDefaultSave?: () => void;
  defaultSaveState?: SaveState;
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
  canEditDefault = false,
  onDefaultChange,
  onDefaultSave,
  defaultSaveState = 'idle',
}: Props) {
  const [open, setOpen] = useState(true);
  const isCustom = source === 'custom';
  const editingDefault = !isCustom && canEditDefault;
  const editable = isCustom || editingDefault;

  const displayValue = isCustom ? html : defaultHtml;
  // 읽기 전용 미리보기 — 생성 안내문구와 동일 줄바꿈 규칙
  const previewHtml = finalizeNoticeHtml(displayValue || '');

  const toEditorHtml = useCallback((v: string) => finalizeNoticeHtml(v || ''), []);

  const handleEditorChange = (next: string) => {
    if (isCustom) onChange(next);
    else onDefaultChange?.(next);
  };

  const { ref, handleFocus, handleBlur, handleInput, afterInsert, emit } = useNoticeRichEditor({
    value: displayValue,
    onChange: handleEditorChange,
    toEditorHtml,
    enabled: editable,
  });

  const insertSanitizedContent = (pasteHtml: string, plain: string) => {
    const next = prepareNoticePasteContent(pasteHtml, plain);
    if (!next) return;
    document.execCommand('insertHTML', false, next);
    afterInsert();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
    insertSanitizedContent(
      e.clipboardData.getData('text/html'),
      e.clipboardData.getData('text/plain'),
    );
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
    insertSanitizedContent(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
  };

  const insertToken = (token: string) => {
    if (!editable) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const ok = document.execCommand('insertText', false, token);
    if (!ok) {
      el.innerHTML += token;
    }
    afterInsert();
  };

  // handleNoticeTemplateChange 등이 이미 source=custom 로 바꿈 — onSourceChange 연속 호출로 덮어쓰지 않음
  const loadDefaultIntoCustom = () => {
    onChange(defaultHtml);
  };

  const activeSave = isCustom ? onSave : onDefaultSave;
  const activeSaveState = isCustom ? saveState : defaultSaveState;
  const saveLabel = isCustom ? '내 서식 저장' : '기본 서식 저장 (전체 적용)';

  const handleSaveClick = () => {
    if (!editable) {
      activeSave?.();
      return;
    }
    const flushed = emit(true);
    if (isCustom) {
      // 빈 flush면 기존 state 기준으로 저장 (서식 삭제 방지)
      onSave(flushed.trim() ? flushed : undefined);
    } else {
      if (flushed.trim()) onDefaultChange?.(flushed);
      onDefaultSave?.();
    }
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
            onSave={editable ? handleSaveClick : undefined}
            saveState={editable ? activeSaveState : 'idle'}
            saveLabel={saveLabel}
          />

          {editingDefault && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
              리아 관리자 모드 — 여기서 저장하면 <strong>모든 담당자</strong>의 기본 서식에 반영됩니다.
            </p>
          )}

          <p className="text-xs text-slate-500">
            {hint ??
              (isCustom
                ? '쓰시던 안내문을 복사해 붙여넣고 토큰을 넣으세요. 편집 후 「내 서식 저장」을 누르면 담당자 계정에 저장됩니다.'
                : editingDefault
                  ? '기본 서식을 바로 수정할 수 있습니다. 「기본 서식 저장」을 누르면 전체에 적용됩니다.'
                  : '기본 서식이 적용됩니다. 「내 서식」으로 바꾸면 편집·저장할 수 있습니다.')}
          </p>

          {editable && (
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

          {editable ? (
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
              className="notice-preview min-h-[100px] w-full overflow-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {editable
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
