'use client';

import { setDashboardTaxFilter, useDashboardTaxFilter } from '@/app/utils/dashboardTaxFilter';
import { FILING_TAXES } from '@/app/utils/filingCheck';

const DASHBOARD_EXCLUDED = new Set(['yearEnd', 'simplePayroll']);
const ITEMS = FILING_TAXES.filter(t => !DASHBOARD_EXCLUDED.has(t.id));

const iconBtn = (active: boolean) =>
  `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-base leading-none transition-colors ${
    active
      ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/50'
  }`;

export default function TaxFilterBar({ compact = false }: { compact?: boolean }) {
  const selected = useDashboardTaxFilter();
  const allView = selected === null;

  if (compact) {
    return (
      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        <button
          type="button"
          aria-pressed={allView}
          title="전체보기"
          onClick={() => setDashboardTaxFilter(null)}
          className={iconBtn(allView)}
        >
          <span aria-hidden>▦</span>
        </button>
        {ITEMS.map(item => {
          const active = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              title={item.label}
              onClick={() => setDashboardTaxFilter(active ? null : item.id)}
              className={iconBtn(active)}
            >
              <span aria-hidden>{item.icon}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={allView}
          onClick={() => setDashboardTaxFilter(null)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
            allView
              ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-200/60'
              : 'border-blue-100 bg-white/70 text-slate-600 hover:border-blue-300 hover:bg-blue-50/60'
          }`}
        >
          <span className="text-base leading-none" aria-hidden>
            ▦
          </span>
          전체보기
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {ITEMS.map(item => {
          const active = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setDashboardTaxFilter(active ? null : item.id)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                active
                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-200/60'
                  : 'border-blue-100 bg-white/70 text-slate-600 hover:border-blue-300 hover:bg-blue-50/60'
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
