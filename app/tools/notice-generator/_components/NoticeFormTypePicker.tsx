'use client';

import { OFFICIAL_FORM_CATALOG } from '../_lib/officialFormCatalog';
import { noticeLabel } from './noticeUi';

type Props = {
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function NoticeFormTypePicker({ selectedId, onSelect }: Props) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <span className={noticeLabel}>공문 세목·기간</span>
      {OFFICIAL_FORM_CATALOG.map(cat => (
        <div key={cat.id}>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">{cat.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {cat.forms.map(form => (
              <button
                key={form.id}
                type="button"
                onClick={() => onSelect(form.id)}
                className={[
                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                  selectedId === form.id
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {form.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
