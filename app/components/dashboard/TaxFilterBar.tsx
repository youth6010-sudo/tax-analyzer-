'use client';

import type { TaxTypeId } from '@/app/config/taxTypes';
import { setDashboardTaxFilter, useDashboardTaxFilter } from '@/app/utils/dashboardTaxFilter';

// 요청 순서: 원천세 · 부가세 · 종소세 · 법인세
const ITEMS: { id: TaxTypeId; label: string; icon: string }[] = [
  { id: 'withholding', label: '원천세', icon: '💸' },
  { id: 'vat', label: '부가세', icon: '🧾' },
  { id: 'comprehensive', label: '종소세', icon: '🧮' },
  { id: 'corporate', label: '법인세', icon: '🏢' },
];

export default function TaxFilterBar() {
  const selected = useDashboardTaxFilter();

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">세목별 보기</p>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(item => {
          const active = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setDashboardTaxFilter(active ? null : item.id)}
              className={`flex w-[4.5rem] flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-xs font-bold transition-all ${
                active
                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-200/60'
                  : 'border-blue-100 bg-white/70 text-slate-600 hover:border-blue-300 hover:bg-blue-50/60'
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
      {selected && (
        <button
          type="button"
          onClick={() => setDashboardTaxFilter(null)}
          className="mt-2 text-[11px] font-medium text-blue-600 hover:underline"
        >
          전체 보기로 초기화
        </button>
      )}
    </div>
  );
}
