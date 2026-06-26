'use client';

import { setDashboardTaxFilter, useDashboardTaxFilter } from '@/app/utils/dashboardTaxFilter';
import { FILING_TAXES } from '@/app/utils/filingCheck';

// 신고대상확인과 동일한 세목 구성(원천세·부가세·사업장현황·종소세·법인세)
const ITEMS = FILING_TAXES;

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
