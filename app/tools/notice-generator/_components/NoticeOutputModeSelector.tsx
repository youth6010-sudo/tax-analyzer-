'use client';

import type { NoticeOutputMode } from '../_lib/officialLetter';
import { NOTICE_OUTPUT_MODES } from '../_lib/officialLetter';
import { noticeLabel } from './noticeUi';

type Props = {
  mode: NoticeOutputMode;
  onSelect: (mode: NoticeOutputMode) => void;
};

export default function NoticeOutputModeSelector({ mode, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={noticeLabel}>메뉴</span>
      <div className="flex flex-wrap gap-1.5">
        {NOTICE_OUTPUT_MODES.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={[
              'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
              mode === item.id
                ? 'border-violet-300 bg-violet-50 text-violet-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
