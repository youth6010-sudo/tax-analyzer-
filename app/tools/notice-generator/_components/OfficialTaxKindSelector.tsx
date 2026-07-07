'use client';

import type { OfficialLetterKind } from '../_lib/officialLetter';
import { OFFICIAL_TAX_KINDS } from '../_lib/officialLetter';
import { noticeLabel } from './noticeUi';

type Props = {
  value: OfficialLetterKind;
  onChange: (value: OfficialLetterKind) => void;
};

export default function OfficialTaxKindSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={noticeLabel}>세목</span>
      <div className="flex flex-wrap gap-1.5">
        {OFFICIAL_TAX_KINDS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={[
              'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
              value === item.id
                ? 'border-blue-300 bg-blue-50 text-blue-900'
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
