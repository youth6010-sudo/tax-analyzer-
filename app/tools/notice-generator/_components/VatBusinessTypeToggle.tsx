'use client';

import {
  VAT_BUSINESS_TYPE_LABEL,
  type VatBusinessType,
} from '../_lib/vatBusinessItems';
import { noticeLabel } from './noticeUi';

type Props = {
  value: VatBusinessType;
  onChange: (value: VatBusinessType) => void;
};

export default function VatBusinessTypeToggle({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={noticeLabel}>사업자 구분</span>
      <div className="flex flex-wrap gap-1.5">
        {(['individual', 'corporate'] as const).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={[
              'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
              value === type
                ? 'border-blue-300 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {VAT_BUSINESS_TYPE_LABEL[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
