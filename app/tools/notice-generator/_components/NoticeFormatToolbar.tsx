'use client';

import type { RefObject } from 'react';
import {
  NOTICE_FONT_SIZES,
  NOTICE_TEXT_COLORS,
  runBold,
  runFontSize,
  runForeColor,
  runItalic,
  runRedo,
  runUnderline,
  runUndo,
} from '../_lib/noticeFormatCommands';
import { noticeBtnSecondary } from './noticeUi';

type Props = {
  editorRef: RefObject<HTMLElement | null> | RefObject<HTMLDivElement | null>;
  onAfterFormat?: () => void;
  disabled?: boolean;
};

const btn =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

export default function NoticeFormatToolbar({ editorRef, onAfterFormat, disabled }: Props) {
  const run = (fn: () => void) => {
    if (disabled) return;
    fn();
    onAfterFormat?.();
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
      onMouseDown={e => {
        // 툴바 클릭 시 에디터 선택 영역 유지
        e.preventDefault();
      }}
    >
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        서식
      </span>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        title="되돌리기"
        onClick={() => run(() => runUndo(editorRef.current))}
      >
        되돌리기
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        title="재실행"
        onClick={() => run(() => runRedo(editorRef.current))}
      >
        재실행
      </button>

      <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />

      <button
        type="button"
        className={btn}
        disabled={disabled}
        title="굵게"
        onClick={() => run(() => runBold(editorRef.current))}
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        title="기울임"
        onClick={() => run(() => runItalic(editorRef.current))}
      >
        <span className="italic">I</span>
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        title="밑줄"
        onClick={() => run(() => runUnderline(editorRef.current))}
      >
        <span className="underline">U</span>
      </button>

      <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />

      <label className="flex items-center gap-1 text-[11px] text-slate-600">
        <span className="sr-only">글자 크기</span>
        <select
          className={`${noticeBtnSecondary} !h-8 !px-2 !py-0 text-xs`}
          disabled={disabled}
          defaultValue=""
          onChange={e => {
            const px = e.target.value;
            if (!px) return;
            run(() => runFontSize(editorRef.current, px));
            e.target.value = '';
          }}
        >
          <option value="" disabled>
            크기
          </option>
          {NOTICE_FONT_SIZES.map(s => (
            <option key={s.px} value={s.px}>
              {s.label} ({s.px})
            </option>
          ))}
        </select>
      </label>

      <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-slate-500">색</span>
        {NOTICE_TEXT_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            className="h-6 w-6 rounded-full border border-slate-300 shadow-sm transition hover:scale-110 disabled:opacity-40"
            style={{ backgroundColor: c.value }}
            title={c.label}
            disabled={disabled}
            onClick={() => run(() => runForeColor(editorRef.current, c.value))}
          />
        ))}
        <input
          type="color"
          className="h-7 w-8 cursor-pointer rounded border border-slate-200 bg-white p-0.5 disabled:opacity-40"
          title="직접 색 선택"
          disabled={disabled}
          defaultValue="#111827"
          onChange={e => run(() => runForeColor(editorRef.current, e.target.value))}
        />
      </div>
    </div>
  );
}
