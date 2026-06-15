'use client';

import { useState } from 'react';
import {
  CHURN_EXAMPLES,
  CHURN_FIELD_LABELS,
  appendChurnFieldValue,
  type ChurnExampleField,
} from '@/app/config/churnExamples';

type Props = {
  disabled?: boolean;
  onApply: (field: ChurnExampleField, value: string) => void;
};

export default function ChurnExamplesPanel({ disabled, onApply }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 overflow-hidden">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left disabled:opacity-50"
      >
        <span className="text-xs font-bold text-amber-900">입력 예시</span>
        <span className="text-[10px] font-semibold text-amber-700">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-amber-100">
          <p className="text-[10px] text-amber-800/80 pt-2">
            예시를 클릭하면 해당 칸에 추가됩니다. 기존 내용이 있으면 아래에 이어 붙입니다.
          </p>
          {CHURN_EXAMPLES.map(ex => (
            <div
              key={ex.id}
              className="rounded-lg border border-amber-100 bg-white p-2.5 flex flex-col sm:flex-row sm:items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-500">
                  {CHURN_FIELD_LABELS[ex.field]} · {ex.label}
                </p>
                <p className="text-[11px] text-gray-700 whitespace-pre-line mt-1 line-clamp-4">
                  {ex.text}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onApply(ex.field, ex.text)}
                className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                이 예시 적용
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { appendChurnFieldValue };
