import { useState } from 'react';
import { htmlToPlainText } from '../_lib/templates';

type Props = {
  messageHtml: string;
  title?: string;
};

export default function ResultBox({ messageHtml, title = '생성된 안내 문구 (서식 유지)' }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);

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
    if (!messageHtml) return;
    const plain = htmlToPlainText(messageHtml);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': new Blob([messageHtml], { type: 'text/html' }),
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
    if (!messageHtml) return;
    const plain = htmlToPlainText(messageHtml);
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
          <button
            type="button"
            onClick={copyPlain}
            disabled={!messageHtml}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
              !messageHtml
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
            disabled={!messageHtml}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95',
              !messageHtml
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

      <div
        className="notice-preview min-h-[260px] w-full overflow-auto rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/40 to-white p-4 text-sm leading-relaxed text-slate-800"
        dangerouslySetInnerHTML={{ __html: messageHtml }}
      />
      <p className="mt-2 text-[11px] text-slate-400">
        ‘서식 유지 복사’는 한글/워드/메일/카페 글 등 서식 편집기에 붙여넣을 때
        색상·이모지·줄간격이 그대로 유지됩니다. 카카오톡 등 일반 메신저는 ‘텍스트만
        복사’를 사용하세요.
      </p>
    </section>
  );
}
