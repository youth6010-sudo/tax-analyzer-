import { useEffect, useRef, useState } from 'react';
import { TOKENS, DEFAULT_TEMPLATE } from '../_lib/template';

// 외부(웹/한글/워드/메신저)에서 복사한 서식(색상·이모지·줄간격 등)을 그대로
// 붙여넣어 유지하는 리치 에디터. 본문에 토큰을 넣으면 결과에서 자동 치환됩니다.
type Props = {
  html: string;
  onChange: (html: string) => void;
};

export default function TemplateEditor({ html, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // 최초 마운트 시 1회만 내용 주입 (입력 중 커서 튐 방지)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertToken = (token: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 현재 커서/선택 위치에 서식을 유지한 채 토큰 텍스트 삽입
    const ok = document.execCommand('insertText', false, token);
    if (!ok) {
      el.innerHTML += token;
    }
    emit();
  };

  const resetTemplate = () => {
    if (ref.current) ref.current.innerHTML = DEFAULT_TEMPLATE;
    onChange(DEFAULT_TEMPLATE);
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
          안내문 서식 (외부 서식 붙여넣기)
        </h2>
        <span className="text-xs text-slate-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            쓰시던 안내문을 그대로 복사해 아래 칸에 붙여넣으면 색상·이모지·줄간격
            등 서식이 유지됩니다. 자동으로 채울 자리에는 아래 토큰을 클릭해
            넣으세요. (입력 내용은 자동 저장)
          </p>

          <div className="flex flex-wrap gap-1.5">
            {TOKENS.map(t => (
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

          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onInput={emit}
            onBlur={emit}
            className="min-h-[180px] w-full resize-y overflow-auto rounded-2xl border border-rose-100 bg-white/70 p-3 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              ※ 붙여넣을 때 서식이 함께 들어옵니다 (Ctrl+Shift+V는 서식 제거).
            </span>
            <button
              type="button"
              onClick={resetTemplate}
              className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 active:scale-95"
            >
              기본 서식으로 초기화
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
