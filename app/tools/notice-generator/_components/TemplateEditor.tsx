import { useEffect, useRef, useState } from 'react';
import { TOKENS, type TemplateSource, type TemplateToken } from '../_lib/template';
import { TemplateSourceToggle } from './TemplateSourceToggle';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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
  const ref = useRef<HTMLDivElement>(null);
  const isCustom = source === 'custom';
  const displayHtml = isCustom ? html : defaultHtml;

  useEffect(() => {
    if (!ref.current || !isCustom) return;
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, html]);

  const emit = () => {
    if (ref.current && isCustom) onChange(ref.current.innerHTML);
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
    emit();
  };

  const loadDefaultIntoCustom = () => {
    if (ref.current) ref.current.innerHTML = defaultHtml;
    onChange(defaultHtml);
    onSourceChange('custom');
  };

  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(167,139,250,0.35)] backdrop-blur-sm sm:p-5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-200 text-sm">
            ✏️
          </span>
          {title}
        </h2>
        <span className="text-xs text-slate-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
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
                  className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 font-mono text-[11px] text-violet-600 transition hover:border-violet-300 hover:bg-white active:scale-95"
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
              onInput={emit}
              onBlur={emit}
              className="min-h-[180px] w-full resize-y overflow-auto rounded-2xl border border-rose-100 bg-white/70 p-3 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          ) : (
            <div
              className="notice-preview min-h-[120px] w-full overflow-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-700"
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {isCustom
                ? '※ 붙여넣을 때 서식이 함께 들어옵니다 (Ctrl+Shift+V는 서식 제거).'
                : '※ 기본 서식은 읽기 전용입니다.'}
            </span>
            {isCustom && (
              <button
                type="button"
                onClick={loadDefaultIntoCustom}
                className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 active:scale-95"
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
